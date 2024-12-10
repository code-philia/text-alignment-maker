import { Button, Flex, rem, ScrollArea, Space, TextInput, Group, Checkbox, Center, TagsInput, Modal, Badge, ColorInput, MantineColor } from '@mantine/core';
import { IconArrowRight, IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import 'highlight.js/styles/atom-one-light.min.css';
import { code_comment_labels, code_text, code_tokens, comment_text, comment_tokens } from '../sample/sample';

const demoFileServer = 'http://localhost:8080';
const demoResultsDirectory = '/home/yuhuan/projects/cophi/vis-feat-proto/auto_labelling/';
const demoCompleteCodeTokensFile = 'tokenized_code_tokens_train.json';
const demoCompleteCommentTokensFile = 'tokenized_comment_tokens_train.json';
const demoLabelingFilePath = 'sorted_labelling_sample_api.jsonl';

// const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

type Sample = {
    index: number,
    text: string,
    tokens: string[],
    labelingRanges: number[][];
}

const demoCommentSamples: Sample[] = [
    {
        index: 3864,
        text: comment_text,
        tokens: comment_tokens,
        labelingRanges: []
    }
];
const demoCodeSamples: Sample[] = [
    {
        index: 3864,
        text: code_text,
        tokens: code_tokens,
        labelingRanges: []
    }
];

class Ranges {
    value: number[];

    constructor(value: number[]) {
        this.value = value;
    }

    expand() {
        const indices = [];
        const ranges = this.value;

        for (let i = 0; i < ranges.length; i += 2) {
            if (i + 1 >= ranges.length) break;

            for (let j = ranges[i]; j <= ranges[i + 1]; ++j) {
                indices.push(j);
            }
        }

        return indices;
    }

    static reduceFrom(indices: number[]): Ranges {
        // make indices sorted
        indices.sort((a, b) => a - b);

        const ranges: number[] = [];

        let start = indices[0];
        let end = indices[0];
        for (let i = 1; i < indices.length; ++i) {
            if (indices[i] <= end + 1) {
                if (indices[i] == end + 1) {
                    end = indices[i];
                }
            } else {
                ranges.push(start, end);
                start = indices[i];
                end = indices[i];
            }
        }
        if (start !== undefined && end !== undefined) {     // FIXME Written too many code to guarantee the structure of output (number[label][2][2 * range]). Write less or add test.
            ranges.push(start, end);
        }

        return new Ranges(ranges);
    }
}

function matchToIndices(match: number[][][]): number[][][] {
    return match.map(
        (label) => label.map((group) => new Ranges(group).expand())
    );
}

function indicesToMatch(indices: number[][][]): number[][][] {
    return indices.map(
        (label) => label.map((group) => group ? Ranges.reduceFrom(group).value : [])
    );
}

const commentGroup = 0;
const codeGroup = 1;

type LabelingProviderOptions = {
    indicesMap?: Map<number, number[][][]>;
    content?: string,
    onSave?: (dumped: string) => void
};

class LabelingProvider {
    private sampleLabelGroupIndices: Map<number, number[][][]> = new Map();
    private onSave?: (dumped: string) => void;

    // suppose the first group is comment and the second group is code
    constructor({ indicesMap, content, onSave }: LabelingProviderOptions) {
        if (indicesMap) {
            this.sampleLabelGroupIndices = indicesMap;
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
                indicesMap: new Map(this.sampleLabelGroupIndices),
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
            return undefined;
        }
    }

    getNumOfLabels(sample: number) {
        return this.sampleLabelGroupIndices.get(sample)?.length ?? 0;
    }

    getTokensOnGroupOnLabel(sample: number, group: number, label: number) {
        return this.sampleLabelGroupIndices.get(sample)?.[label]?.[group];
    }

    getTokensOnGroup(sample: number, group: number) {
        return this.sampleLabelGroupIndices.get(sample)?.map((label) => label[group] ?? []);
    }

    addTokensToLabel(sample: number, group: number, label: number, tokens: number[]) {
        let indicesOfSample = this.sampleLabelGroupIndices.get(sample);
        if (!indicesOfSample || indicesOfSample.length < label + 1) {    // TODO it's very difficult to guarantee the indexed element in array is not null
            indicesOfSample = Array(label + 1).fill(0).map(() => [[], []]);
            this.sampleLabelGroupIndices.set(sample, indicesOfSample);
        }

        let indicesOfSampleOfLabel = indicesOfSample[label];    // this could be an empty array, not an array of length 2!
        if (!indicesOfSampleOfLabel || indicesOfSampleOfLabel.length < 2) {
            indicesOfSampleOfLabel = Array(2).fill(0).map(() => []);
            indicesOfSample[label] = indicesOfSampleOfLabel;
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
        const indicesOfSample = this.sampleLabelGroupIndices.get(sample);
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
        for (let i = 0; i < this.getNumOfLabels(sample); ++i) {
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
                this.sampleLabelGroupIndices.set(idx, ranges);
            }
        });
    }

    save() {
        if (this.onSave) {
            const dumped = Array.from(this.sampleLabelGroupIndices.entries())
                .map(([idx, indicesOfSample]) => JSON.stringify({ idx, match: indicesToMatch(indicesOfSample) }))
                .join('\n');

            this.onSave(dumped);
        }
    }
}

// the only way to use this OOP data processing center is to customize a hook
// function useLabelingProvider() {
//     const LabelingProvider =
//     const { provider, setProvider } = useState();

//     return { remove, getTokensOnGroup }
// }

function isSpecialToken(token: string) {
    return token.startsWith('<') && token.endsWith('>');
}

function removeDocstrings(code: string): string {
    code = code.replace(/""".*?"""/gs, '');
    code = code.replace(/'''.*?'''/gs, '');
    return code;
}

function findCommentEnd(s: string, pos: number): number {
    let i = pos;

    while (i < s.length && /\s/.test(s[i])) {
        i++;
    }

    if (s[i] === '#') {
        while (i < s.length && s[i] !== '\n') {
            i++;
        }
    }

    return i;
}

function generateHighlightedCode(
    codeElement: HTMLElement,
    originalText: string,
    tokens: string[],
    groupedTokenIndices: number[][]
): HTMLElement {
    // FIXME this should add an option, because this simply removes docstring. Some user may choose not to remove
    originalText = removeDocstrings(originalText);

    codeElement.innerHTML = "";

    const tokenToLabel: Map<number, number> = new Map();
    groupedTokenIndices.forEach((group, groupIndex) => {
        group.forEach((index) => {
            tokenToLabel.set(index, groupIndex);
        });
    });

    let pos = 0;

    // flush next token, if tokenIndex < 0 only text is flushed
    const flush = (nextPos: number, length: number, tokenIndex: number) => {
        if (nextPos > pos) {
            const text = originalText.slice(pos, nextPos);
            codeElement.appendChild(document.createTextNode(text));
        }
        pos = nextPos;

        if (tokenIndex >= 0) {
            const tokenInText = originalText.slice(pos, pos + length);
            const span = document.createElement("span");

            const labelNumber = tokenToLabel.get(tokenIndex);
            span.classList.add(`token-${tokenIndex}`);
            if (labelNumber !== undefined) {
                span.classList.add(`label-${labelNumber}`);
            }

            span.textContent = tokenInText;
            codeElement.appendChild(span);

            pos += length;
        }
    };

    // PITFALL: groupedTokenIndices is skipping special tokens
    let indexForGroupTokens = 0;

    tokens.forEach((token, i) => {
        if (isSpecialToken(token)) return;

        token = token.replace('\u0120', '');

        // skip comments, to match tokens
        // FIXME this should add an option, because this will also skip python comments in comment sample
        const commentEnd = findCommentEnd(originalText, pos);

        const nextPos = originalText.indexOf(token, commentEnd);
        if (nextPos >= 0) {
            flush(nextPos, token.length, indexForGroupTokens);
        } else {
            return;
        }

        indexForGroupTokens += 1;
    });
    flush(originalText.length, 0, -1);

    return codeElement;
}

function mouseEventLiesIn(e: MouseEvent, ...targetSpans: HTMLElement[]) {
    return e.target instanceof Node
        && targetSpans.some((span) => span.contains(e.target as Node));
}

function getSelectedNodes(selection: Selection, targetNodes: Node[]) {
    const selectedElements: Node[] = [];

    for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        const startContainer = range.startContainer;
        const endContainer = range.endContainer;

        const startSpan = targetNodes.find((span) => span.contains(startContainer));
        const endSpan = targetNodes.find((span) => span.contains(endContainer));

        if (!(startSpan || endSpan)) return;

        const _startIndex = (startSpan && targetNodes.indexOf(startSpan)) ?? 0;
        const startIndex = _startIndex < 0 ? 0 : _startIndex;                   // If startSpan is not found? Will that happen?

        const _endIndex = (endSpan && targetNodes.indexOf(endSpan)) ?? targetNodes.length - 1;
        const endIndex = _endIndex < 0 ? targetNodes.length - 1 : _endIndex;    // If endSpan is not found? Will that happen?

        selectedElements.push(...targetNodes.slice(startIndex, endIndex + 1));
    }

    return selectedElements;
}

function expandSelectedRanges(selection: Selection, targetSpans: HTMLElement[]) {
    for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        const startContainer = range.startContainer;
        const endContainer = range.endContainer;

        const startSpan = targetSpans.find((span) => span.contains(startContainer));
        const endSpan = targetSpans.find((span) => span.contains(endContainer));

        if (startSpan && endSpan) {
            selection.removeRange(range);
            range.setStart(startSpan, 0);
            range.setEnd(endSpan, endSpan.childNodes.length);

            selection.addRange(range);
        }
    }
}

const tokenIndexPrefix = 'token-';
const labelPrefix = 'label-';

function getFollowingNumber(cls: string, prefix: string) {
    if (cls.startsWith(prefix)) {
        const labelNumber = parseInt(cls.slice(prefix.length));
        if (!isNaN(labelNumber)) {
            return labelNumber;
        }
    }
    return undefined;
};
function getNumberOfElement(element: HTMLElement, prefix: string) {
    for (const cls of element.classList) {
        const labelNumber = getFollowingNumber(cls, prefix);
        if (labelNumber !== undefined) {
            return labelNumber;
        }
    }
    return undefined;
};
function processSelectionEvents(code: HTMLElement, onTokenSelectionChange?: (selectedTokenIndices: number[]) => void) {

    // deal with selected spans style changing
    const onWindowSelectionChange = () => {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            const selectedElements = new Set(getSelectedNodes(selection, Array.from(code.childNodes)));

            const selectedTokenIndices: number[] = [];
            code.querySelectorAll('span').forEach((span) => {
                if (selectedElements.has(span)) {
                    const tokenIndex = getFollowingNumber(span.classList[0], tokenIndexPrefix);
                    if (tokenIndex !== undefined) {
                        selectedTokenIndices.push(tokenIndex);
                    }

                    span.classList.add('selected');
                } else {
                    span.classList.remove('selected');
                }
            });

            onTokenSelectionChange?.(selectedTokenIndices);
        } else {
            code.querySelectorAll('span').forEach((span) => {
                span.classList.remove('selected');
            });

            onTokenSelectionChange?.([]);
        }
    };
    document.addEventListener('selectionchange', onWindowSelectionChange);

    // deal with focus and unfocus
    // let focused = false;

    // const onWindowMouseDown = (e: MouseEvent) => {
    //     if (!mouseEventLiesIn(e, ...targetSpans)) {
    //         focused = false;
    //         targetSpans.forEach((span) => {
    //             span.classList.remove('selected');
    //         });

    //         onTokenSelectionChange?.([]);
    //     }
    // };
    // window.addEventListener('mousedown', onWindowMouseDown);

    // detail: all the range of the covered spans are selected
    const onWindowMouseUp = () => {
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
            expandSelectedRanges(selection, Array.from(code.querySelectorAll('span')));
        }
    };
    window.addEventListener('mouseup', onWindowMouseUp);

    // const onEachSpanMouseDown = () => {
    //     focused = true;
    // };
    // targetSpans.forEach((span) => {
    //     span.addEventListener('mousedown', onEachSpanMouseDown);
    // });

    return () => {
        document.removeEventListener('selectionchange', onWindowSelectionChange);
        window.removeEventListener('mouseup', onWindowMouseUp);
    };
}

const getMantineColor = (colorLiteral: string) => {
    return `var(--mantine-color-${colorLiteral}-filled)`;
};
function processTokens(code: HTMLElement, groupColors: string[]) {
    const targetSpans: HTMLElement[] = [];

    code.childNodes.forEach((node) => {
        if (node instanceof HTMLSpanElement){
            targetSpans.push(node);
        }
    });

    targetSpans.forEach((span) => {
        const labelNumber = getNumberOfElement(span, labelPrefix);
        if (labelNumber !== undefined) {
            span.style.color = getMantineColor(groupColors[labelNumber]);
        }
    });
}

type CodeBlockProps = {
    code: string;
    tokens: string[];
    groupedTokenIndices: number[][];
    groupColors: string[];
    onTokenSelectionChange?: (selectedTokenIndices: number[]) => void;
};

function CodeBlock({ code, tokens, groupedTokenIndices, groupColors, onTokenSelectionChange }: CodeBlockProps) {
    const codeRef = useRef<HTMLPreElement>(null);

    useEffect(() => {
        if (codeRef.current) {
            generateHighlightedCode(codeRef.current, code, tokens, groupedTokenIndices);
            processTokens(codeRef.current, groupColors);
            return processSelectionEvents(codeRef.current, onTokenSelectionChange);
        }
    }, [code, groupColors, groupedTokenIndices, onTokenSelectionChange, tokens]);

    return (
        <pre className='target-code-pre'>
            <ScrollArea w={400} h={300}>
                <code ref={codeRef}>
                    {code}
                </code>
            </ScrollArea>
        </pre>
    );
}

type NumberNavigationProps = {
    value: number;
    total: number;
    onChangeValue: (i: number) => void;
}

function NumberNavigationProps({ value, total, onChangeValue }: NumberNavigationProps) {
    const numOfOptions = 10;

    const startIndex = Math.floor(value / numOfOptions) * numOfOptions;
    const endIndex = Math.min(startIndex + numOfOptions, total);

    const isFirst = value == 0;
    const isLast = value == total - 1;

    const isSelected = (i: number) => value % 10 === i;

    return (
        <Group gap='3'>
            <Button
                className='number-navigation-button'
                variant='transparent'
                color='gray'
                disabled={isFirst}
                onClick={() => onChangeValue(value - 1)}
            >
                <IconArrowLeft />
            </Button>
            {new Array(endIndex - startIndex).fill(0).map((_, i) => (
                <Button
                    key={i + 1}
                    className='number-navigation-button'
                    variant={ isSelected(i) ? 'filled' : 'transparent' }
                    color={ isSelected(i) ? 'blue' : 'gray' }
                    onClick={() => onChangeValue(startIndex + i)}
                >
                    {startIndex + i + 1}
                </Button>
            ))}
            <Button
                className='number-navigation-button'
                variant='transparent'
                color='gray'
                disabled={isLast}
                onClick={() => onChangeValue(value + 1)}
            >
                <IconArrowRight />
            </Button>
        </Group>
    );
}

type AlignmentLabel = {
    text: string;
    color: string;
};

type AlignmentLabelsProps = {
    labels: AlignmentLabel[];
    setLabels: (labels: AlignmentLabel[]) => void;
    onClickLabel?: (index: number) => void;
}

function AlignmentLabels({ labels, setLabels, onClickLabel } : AlignmentLabelsProps) {
    const [newLabelText, setNewLabelText] = useState('');
    const [newLabelColor, setNewLabelColor] = useState('#000000');  // FIXME just a placeholder now, not changeable
    const [modalOpened, setModalOpened] = useState(false);

    const addLabel = () => {
        if (newLabelText.trim()) {
            setLabels([...labels, { text: newLabelText, color: newLabelColor }]);
            setNewLabelText('');
            setNewLabelColor('#000000');
            setModalOpened(false);
        }
    };

    return (
        <>
            <div style={{ padding: '20px' }}>
                <Group gap="sm">
                    <Badge
                        color='black'
                        className='label-badge remove-label'
                        onMouseDown={() => onClickLabel?.(-1)}
                    >
                        No Label
                    </Badge>
                    {labels.map((label, index) => (
                        <Badge
                            key={index}
                            color={label.color}
                            variant="filled"
                            className='label-badge'
                            onMouseDown={() => onClickLabel?.(index)}
                        >
                            {label.text}
                        </Badge>
                    ))}
                    <Badge
                        leftSection={<IconPlus style={{ width: rem(12), height: rem(12) }} />}
                        color='gray'
                        className='label-badge add-label'
                        onClick={() => {
                            setNewLabelText(`Label ${labels.length + 1}`);   // FIXME this should use a same function as the setLabels function creating labels below
                            setModalOpened(true);
                        }}
                    >
                        New
                    </Badge>
                </Group>

            </div>
            <Modal
                opened={modalOpened}
                onClose={() => setModalOpened(false)}
                title="Add New Label"
                size="sm" // Ensures the modal fits the screen better
            >
                <TextInput
                    label="Label Text"
                    placeholder="Enter label text"
                    value={newLabelText}
                    onChange={(event) => setNewLabelText(event.target.value)}
                />
                {/* <ColorInput
                    label="Label Color"
                    placeholder="Pick a color"
                    value={newLabelColor}
                    onChange={(value) => setNewLabelColor(value)}
                    style={{ marginTop: '15px' }}
                /> */}
                <Group align="right" style={{ marginTop: '20px' }}>
                    <Button onClick={addLabel}>Add</Button>
                </Group>
            </Modal>
        </>
    );
};

const standardColors: MantineColor[] = ['blue', 'green', 'red', 'yellow', 'orange', 'cyan', 'lime', 'pink', 'dark', 'gray', 'grape', 'violet', 'indigo', 'teal'];
function generateColorForLabelIndex(index: number) {
    return standardColors[index % standardColors.length];
}
function generateColorForLabels(num: number) {
    const colors: MantineColor[] = [];
    for (let i = 0; i < num; i++) {
        colors.push(generateColorForLabelIndex(i));
    }
    return colors;
}

type Label = {
    text: string;
    color: string;
}

function setLabelOfTokens(sample: number, group: number, label: number, tokens: number[], provider: LabelingProvider, samples: Sample[], setSamples: (s: Sample[]) => void) {
    if (label < 0) {
        provider.removeTokensFromAllLabels(samples[sample].index, group, tokens);
    } else {
        provider.changeTokensToLabel(samples[sample].index, group, label, tokens);
    }
    setSamples(samples.splice(sample, 1, {
        ...samples[sample],
        labelingRanges: provider.getTokensOnGroup(samples[sample].index, codeGroup) ?? []
    }));
};

export function Feature() {
    // Options
    const [optionOutlineTokens, setOptionOutlineTokens] = useState(true);
    const [optionTokensDirectory, setOptionTokensDirectory] = useState(demoResultsDirectory);
    const [optionLocalServer, setOptionLocalServer] = useState(demoFileServer);

    // Data
    const [codeSamples, setCodeSamples] = useState<Sample[]>(demoCodeSamples);
    const [commentSamples, setCommentSamples] = useState<Sample[]>(demoCommentSamples);

    const [labelingProvider, setLabelingProvider] = useState(
        new LabelingProvider({
            content: '',
            onSave: (dumped) => {
                setDumpedString(dumped);
                setModalOpened(true);
                console.log(dumped);
            }
        })
    );

    // Data Saving
    const [dumpedString, setDumpedString] = useState('');
    const [modalOpened, setModalOpened] = useState(false);

    // Navigation
    const [currentSampleIndex, setCurrentSampleIndex] = useState(0);
    // const [selectedIndices, setSelectedSampleIndices] = useState<string[]>([]);

    // Labeling
    const [labels, setLabels] = useState<Label[]>([]);
    const [selectedCodeTokens, setSelectedCodeTokens] = useState<number[]>([]);
    const [selectedCommentTokens, setSelectedCommentTokens] = useState<number[]>([]);

    const setLabelsWithDefaultColor = (labels: Label[]) => {
        // FIXME should avoid modifying the original object, everywhere?
        labels.forEach((label, i) => {
            label.color = generateColorForLabelIndex(i);
        });
        setLabels(labels);
    };

    const updateLabelingProvider = useCallback(() => {
        const numOfLabels = labelingProvider.getNumOfLabels(codeSamples[currentSampleIndex].index);
        const defaultGeneratedColors = generateColorForLabels(numOfLabels);

        setLabels(Array(numOfLabels).fill(0).map((_, i) => ({ text: `Label ${i + 1}`, color: defaultGeneratedColors[i] })));
    }, [codeSamples, currentSampleIndex, labelingProvider]);

    const setLabelOfCodeTokens = useCallback((label: number) => {
        setLabelOfTokens(
            currentSampleIndex,
            codeGroup,
            label,
            selectedCodeTokens,
            labelingProvider,
            codeSamples,
            setCodeSamples
        );
    }, [currentSampleIndex, selectedCodeTokens, codeSamples, labelingProvider]);

    const setLabelOfCommentTokens = useCallback((label: number) => {
        setLabelOfTokens(
            currentSampleIndex,
            commentGroup,
            label,
            selectedCommentTokens,      // TODO can we decouple "code and comment" to any multiple groups?
            labelingProvider,
            commentSamples,
            setCommentSamples
        );
    }, [currentSampleIndex, selectedCommentTokens, commentSamples, labelingProvider]);

    const clickLabelCallback = (label: number) => {
        if (selectedCodeTokens.length > 0) {
            setLabelOfCodeTokens(label);
        }
        if (selectedCommentTokens.length > 0) {
            setLabelOfCommentTokens(label);
        }
    };

    // A test function of fetch
    const loadFileCallback = useCallback(() => {
        fetch(`/mock/${demoLabelingFilePath}`)
            .then((response) => {
                if (!response.ok) {
                    throw new Error('Cannot fetch labeling file');
                }

                return response.text();
            })
            .then((data) => {
                labelingProvider.load(data);
                setLabelingProvider(labelingProvider.copy());
                updateLabelingProvider();
            })
            .catch((error) => {
                console.error('Cannot get json:', error);
            });
    }, [labelingProvider, optionLocalServer, updateLabelingProvider]);  // FIXME is nested useCallback ugly?

    // Code Area
    const codeArea = (sample: Sample, labelingRanges: number[][], labels: Label[], onTokenSelectionChange?: (selectedTokenIndices: number[]) => void) => {
        return (
            <CodeBlock
                code={sample.text}
                tokens={sample.tokens}
                groupedTokenIndices={labelingRanges}
                groupColors={labels.map((label) => label.color)}
                onTokenSelectionChange={(s: number[]) => {
                    console.log(`selection changed to ${s}`);
                    onTokenSelectionChange?.(s);
                }}
            />
        );
    };

    const codeAreaForComment = useMemo(() => {
        return codeArea(
            commentSamples[currentSampleIndex],
            labelingProvider.getTokensOnGroup(codeSamples[currentSampleIndex].index, commentGroup) ?? [],
            labels,
            setSelectedCommentTokens
        );
    }, [codeSamples, commentSamples, currentSampleIndex, labels, labelingProvider]);

    const codeAreaForCode = useMemo(() => {
        return codeArea(
            codeSamples[currentSampleIndex],
            labelingProvider.getTokensOnGroup(codeSamples[currentSampleIndex].index, codeGroup) ?? [],
            labels,
            setSelectedCodeTokens
        );
    }, [codeSamples, currentSampleIndex, labels, labelingProvider]);

    // Data Loading
    useEffect(() => {
        // Set up labels and colors
        updateLabelingProvider();
    }, [currentSampleIndex, updateLabelingProvider]);   // FIXME why should we call again here, after rendering all the code?

    const classList = ['feature-block'];
    if (optionOutlineTokens) {
        classList.push('outline-tokens');
    }

    const className = classList.join(' ');

    return (
        <div className={className} style={{ width: '960px' }}>
            <Flex align='flex-end'>
                <TextInput
                    disabled={true}
                    value={demoResultsDirectory}
                    label='Tokens directory'
                    description='Directory that contains tokens of samples'
                    style={{ flexGrow: 1 }}
                />
                <Space w='sm'></Space>
                <Button onClick={loadFileCallback}>Load</Button>
            </Flex>
            <Space h='sm'></Space>
            <Group>
                <Checkbox
                    checked={optionOutlineTokens}
                    onChange={(event) => setOptionOutlineTokens(event.currentTarget.checked)}
                    label='Outline Tokens' />
            </Group>
            <Space h='md'></Space>
            <Center>
                <NumberNavigationProps
                    value={currentSampleIndex}
                    total={demoCommentSamples.length}
                    onChangeValue={setCurrentSampleIndex}
                />
            </Center>
            <Center>
                <AlignmentLabels
                    labels={labels}
                    setLabels={setLabelsWithDefaultColor}
                    onClickLabel={clickLabelCallback}
                />
                <Button
                    onClick={() => labelingProvider.save()}
                >
                    Save Labeling
                </Button>
            </Center>
            <Group gap='sm' justify='center'>
                {codeAreaForComment}
                {codeAreaForCode}
            </Group>
            {/* <TagsInput
                value={selectedIndices}
                onChange={searchSampleCallback}
                label='Selected Samples'
                clearable
            >
            </TagsInput> */}
            <Modal
                opened={modalOpened}
                onClose={() => setModalOpened(false)}
                title="Dumped String"
                size="lg"
            >
                <pre>
                    <ScrollArea >
                        <code>
                            {dumpedString}
                        </code>
                    </ScrollArea>
                </pre>
                <Button
                    onClick={() => {
                        navigator.clipboard.writeText(dumpedString);
                        setModalOpened(false);
                    }}
                >Copy</Button>
            </Modal>
        </div>
    );
}
