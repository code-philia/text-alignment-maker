import { matchToIndices, indicesToMatch, deepCopyNestedArrays } from '../utils';

// const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';
export type LabeledTextSample = {
    index: number;
    text: string;
    tokens: string[];
    labelingRanges: number[][];
};
export const commentGroup = 0;
export const codeGroup = 1;
type LabelingProviderOptions = {
    copied?: LabelingProvider;
    content?: string;
    onSave?: (dumped: string) => void;
};

// TODO split this into sample-wise
export class LabelingProvider {
    listOfSampleLabelGroupIndices: {
        idx: number;
        match: number[][][];
    }[] = [];
    private sampleIndices: number[] = [];
    private sampleLabelGroupTokens: Map<number, number[][][]> = new Map();
    private onSave?: (dumped: string) => void;

    private originalSampleLabelGroupTokens: Map<number, number[][][]> = new Map();

    // suppose the first group is comment and the second group is code
    constructor({ copied, content, onSave }: LabelingProviderOptions) {
        if (copied) {
            this.sampleIndices = copied.sampleIndices;
            this.sampleLabelGroupTokens = copied.sampleLabelGroupTokens;
            this.originalSampleLabelGroupTokens = copied.originalSampleLabelGroupTokens;
            this.onSave = copied.onSave;
        } else if (content) {
            this.load(content);
        }
        if (onSave) {
            this.onSave = onSave;
        }
    }

    copy() {
        return new LabelingProvider(
            {
                copied: this
            }
        );
    }

    private parseSample(line: string): [number, number[][][]] | undefined {
        try {
            const sampleData = JSON.parse(line);
            const idx = sampleData['idx'];
            if (typeof idx !== 'number') {
                throw new Error(`Invalid sample data: idx ${idx} is not a number`);
            }

            const match = sampleData['match'];
            if (!Array.isArray(match)
                || !match.every((label) => Array.isArray(label)
                    && label.every((group) => Array.isArray(group)
                        && group.every((num) => typeof num === 'number')))) {
                throw new Error(`Invalid sample data: match is not a number[][][]`);
            }

            const parsedRanges = matchToIndices(match);

            return [idx, parsedRanges];
        } catch (error) {
            console.error('Cannot parse json line: ', error);
            throw error;
        }
    }

    getLabelingOnSample(sample: number) {
        return this.sampleLabelGroupTokens.get(sample);
    }

    setRawIndexLabelingOnSample(sample: number, rawRangeLabeling: number[][][]) {
        this.sampleLabelGroupTokens.set(sample, rawRangeLabeling);
    }

    getNumOfLabelsOnSample(sample: number) {
        return this.sampleLabelGroupTokens.get(sample)?.length ?? 0;
    }

    getSampleIndices() {
        return this.sampleIndices;
    }

    getTokensOnGroupOnLabel(sample: number, group: number, label: number) {
        return this.sampleLabelGroupTokens.get(sample)?.[label]?.[group];
    }

    getTokensOnGroup(sample: number, group: number) {
        return this.sampleLabelGroupTokens.get(sample)?.map((label) => label[group] ?? []);
    }

    addTokensToLabel(sample: number, group: number, label: number, tokens: number[]) {
        let indicesOfSample = this.sampleLabelGroupTokens.get(sample);
        if (!indicesOfSample) {
            indicesOfSample = [];
            this.sampleLabelGroupTokens.set(sample, indicesOfSample);
        }
        if (indicesOfSample.length < label + 1) {
            const oldLength = indicesOfSample.length;
            indicesOfSample.push(...Array(label + 1 - oldLength).fill(0).map(() => [[], []]));
        }

        let indicesOfSampleOfLabel = indicesOfSample[label]; // this could be an empty array, not an array of length 2!
        if (!indicesOfSampleOfLabel) {
            indicesOfSampleOfLabel = [];
            indicesOfSample[label] = indicesOfSampleOfLabel;
        }
        if (indicesOfSampleOfLabel.length < 2) {
            const oldLength = indicesOfSampleOfLabel.length;
            indicesOfSampleOfLabel.push(...Array(2 - oldLength).fill(0).map(() => []));
        }

        let indicesOfSampleOfLabelOfGroup = indicesOfSampleOfLabel[group];
        if (!indicesOfSampleOfLabelOfGroup) {
            indicesOfSampleOfLabelOfGroup = [];
            indicesOfSampleOfLabel[group] = indicesOfSampleOfLabelOfGroup;
        }

        // FIXME extract the auto-adding chain-indexing above to a function
        indicesOfSampleOfLabelOfGroup.push(...tokens);
    }

    removeTokensOnLabel(sample: number, group: number, label: number, tokens: number[]) {
        const indicesOfSample = this.sampleLabelGroupTokens.get(sample);
        if (!indicesOfSample) {
            return;
        }

        const indicesOfSampleByLabel = indicesOfSample[label];
        if (!indicesOfSampleByLabel) {
            return;
        }

        const indicesOfSampleByLabelByGroup = indicesOfSampleByLabel[group];
        if (!indicesOfSampleByLabelByGroup) {
            return;
        }

        const tokensSet = new Set(tokens);
        const newIndices = indicesOfSampleByLabelByGroup.filter((idx) => {
            return !tokensSet.has(idx);
        });

        indicesOfSampleByLabelByGroup.length = 0;
        indicesOfSampleByLabelByGroup.push(...newIndices);

        // TODO auto remove and shift labels (keep color) if both groups have no indices
    }

    // TODO A question, using sample as number? Should be sampleIndex? :)
    removeTokensFromAllLabels(sample: number, group: number, tokens: number[]) {
        for (let i = 0; i < this.getNumOfLabelsOnSample(sample); ++i) {
            this.removeTokensOnLabel(sample, group, i, tokens);
        }
    }

    changeTokensToLabel(sample: number, group: number, label: number, tokens: number[]) {
        this.removeTokensFromAllLabels(sample, group, tokens);
        this.addTokensToLabel(sample, group, label, tokens);
    }

    load(content: string) {
        this.sampleLabelGroupTokens.clear();

        const lines = content.split('\n');
        lines.forEach((line) => {
            line = line.trim();
            if (line.length === 0) return;

            const parsed = this.parseSample(line);
            if (parsed) {
                const [idx, ranges] = parsed;
                this.sampleLabelGroupTokens.set(idx, ranges);
            }
        });
        this.loadMapToList();

        this.originalSampleLabelGroupTokens = new Map();
        for (const [k, v] of this.sampleLabelGroupTokens.entries()) {
            this.originalSampleLabelGroupTokens.set(k, deepCopyNestedArrays(v));    // TODO find a library that specifically serve deep copying
        }
    }

    resetSample(sample: number) {
        const target = this.originalSampleLabelGroupTokens.get(sample);
        const originalSampleLabeling = target ? deepCopyNestedArrays(target) : [];     // TODO don't use this random array, use an object to manipulate it
        this.sampleLabelGroupTokens.set(sample, originalSampleLabeling);
    }

    clearAllLabelsForSample(sample: number) {
        const indicesOfSample = this.sampleLabelGroupTokens.get(sample);
        if (!indicesOfSample) {
            return;
        }

        this.sampleLabelGroupTokens.set(sample, []);
    }

    loadMapToList() {
        this.listOfSampleLabelGroupIndices = Array.from(this.sampleLabelGroupTokens.entries())
            .map(([idx, match]) => ({ idx, match }));
        this.sampleIndices = this.listOfSampleLabelGroupIndices.map((sample) => sample.idx);
    }

    save() {
        if (this.onSave) {
            const dumped = Array.from(this.sampleLabelGroupTokens.entries())
                .map(([idx, indicesOfSample]) => JSON.stringify({ idx, match: indicesToMatch(indicesOfSample) }))
                .join('\n');

            this.onSave(dumped);
        }
    }
}

// define a type for {"student": 546, "teachers": [{"teacher_idx": 18947, "pattern": "ROOT:VERB_OBJ:NOUN", "cluster": 12}, {"teacher_idx": 6297, "pattern": "ROOT:VERB_OBJ:NOUN", "cluster": 8}]}

export type TeachersRelationship = {
    student_idx: number;
    teachers: {
        teacher_idx: number;
        [key: string]: any;
    }[];
};
export type TeachersResult = TeachersRelationship[];

export function isTeachersRelationship(data: TeachersRelationship): data is TeachersRelationship {
    if (typeof data !== 'object') return false;
    if (typeof data['student_idx'] !== 'number') return false;
    if (!Array.isArray(data['teachers'])) return false;
    for (const teacher of data['teachers']) {
        if (typeof teacher['teacher_idx'] !== 'number') return false;
    }
    return true;
}

export function isTeachersResult(data: TeachersResult): data is TeachersResult {
    for (const item of data) {
        if (!isTeachersRelationship(item)) return false;
    }
    return true;
}

export type TeachersRelationshipOptions = {
    data?: TeachersResult;
    teachersMap?: Map<number, TeachersRelationship['teachers']>;
}
export class TeachersRelationshipProvider {
    private teachers: Map<number, TeachersRelationship['teachers']> = new Map();

    constructor({ data, teachersMap }: TeachersRelationshipOptions) {
        if (teachersMap) {
            this.teachers = new Map(teachersMap);
        } else if (data) {
            this.teachers = new Map(data.map(({ student_idx, teachers }) => [student_idx, teachers]));
        }
    }

    copy() {
        return new TeachersRelationshipProvider({
            teachersMap: new Map(this.teachers)
        });
    }

    getTeachers(idx: number) {
        return this.teachers.get(idx);
    }
}
