import { matchToIndices, indicesToMatch } from './utils';

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
    indicesMap?: Map<number, number[][][]>;
    content?: string;
    onSave?: (dumped: string) => void;
};
export class LabelingProvider {
    listOfSampleLabelGroupIndices: {
        idx: number;
        match: number[][][];
    }[] = [];
    private sampleIndices: number[] = [];
    private sampleLabelGroupTokens: Map<number, number[][][]> = new Map();
    private onSave?: (dumped: string) => void;

    // suppose the first group is comment and the second group is code
    constructor({ indicesMap, content, onSave }: LabelingProviderOptions) {
        if (indicesMap) {
            this.sampleLabelGroupTokens = indicesMap;
            this.loadMapToList();
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
                indicesMap: new Map(this.sampleLabelGroupTokens),
                onSave: this.onSave
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
    student: number;
    teachers: {
        teacher_idx: number;
        pattern: string;
        cluster: number;
    }[];
};
export type TeachersResult = TeachersRelationship[];

export function isTeachersRelationship(data: TeachersRelationship): data is TeachersRelationship {
    if (typeof data !== 'object') return false;
    if (typeof data['student'] !== 'number') return false;
    if (!Array.isArray(data['teachers'])) return false;
    for (const teacher of data['teachers']) {
        if (typeof teacher['teacher_idx'] !== 'number') return false;
        if (typeof teacher['pattern'] !== 'string') return false;
        if (typeof teacher['cluster'] !== 'number') return false;
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
            this.teachers = new Map(data.map(({ student, teachers }) => [student, teachers]));
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
