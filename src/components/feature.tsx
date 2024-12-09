import { Button, Flex, rem, ScrollArea, Space, TextInput, Group, Checkbox, Center, TagsInput, Modal, Badge, ColorInput, MantineColor } from '@mantine/core';
import { IconArrowRight, IconArrowLeft, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import 'highlight.js/styles/atom-one-light.min.css';
import { code_comment_labels, code_text, code_tokens, comment_text, comment_tokens } from '../sample/sample';

const demoFileServer = 'http://localhost:8080';
const demoResultsDirectory = '/home/yuhuan/projects/cophi/vis-feat-proto/auto_labelling/';
const demoCompleteCodeTokensFile = 'tokenized_code_tokens_train.json';
const demoCompleteCommentTokensFile = 'tokenized_comment_tokens_train.json';
const demoLabelingFilePath = 'sorted_labelling_sample_api.jsonl';

// const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

type Sample = {
    text: string,
    tokens: string[],
    labelingRanges: number[][];
}

const commentSamples: Sample[] = [
    {
        text: comment_text,
        tokens: comment_tokens,
        labelingRanges: code_comment_labels.map((group) => group[0])
    }
];
const codeSamples: Sample[] = [
    {
        text: code_text,
        tokens: code_tokens,
        labelingRanges: code_comment_labels.map((group) => group[1])
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
        ranges.push(start, end);

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
        (label) => label.map((group) => Ranges.reduceFrom(group).value)
    );
}

const commentGroup = 0;
const codeGroup = 1;
class LabelingProvider {
    // suppose the first group is comment and the second group is code
    private indicesOfEachSampleByLabelByGroup: Map<number, number[][][]> = new Map();
    private onSave?: (dumped: string) => void;

    constructor(content: string, onSave?: (dumped: string) => void) {
        const lines = content.split('\n');
        lines.forEach((line) => {
            const parsed = this.parseSample(line);
            if (parsed) {
                const [idx, ranges] = parsed;
                this.indicesOfEachSampleByLabelByGroup.set(idx, ranges);
            }
        });

        this.onSave = onSave;
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
        return this.indicesOfEachSampleByLabelByGroup.get(sample)?.length ?? 0;
    }

    getTokensOnLabel(sample: number, group: number, label: number) {
        return this.indicesOfEachSampleByLabelByGroup.get(sample)?.[label]?.[group];
    }

    addTokensOnLabel(sample: number, group: number, label: number, tokens: number[]) {
        const indicesOfSample = this.indicesOfEachSampleByLabelByGroup.get(sample);
        if (!indicesOfSample) {
            this.indicesOfEachSampleByLabelByGroup.set(sample, Array.from({ length: label + 1 }, () => []));
        }

        const indicesOfSampleByLabel = this.indicesOfEachSampleByLabelByGroup.get(sample);
        if (!indicesOfSampleByLabel) {
            return;
        }

        const indicesOfSampleByLabelByGroup = indicesOfSampleByLabel[group];
        if (!indicesOfSampleByLabelByGroup) {
            return;
        }

        indicesOfSampleByLabelByGroup.push(tokens);
    }

    removeTokensOnLabel(sample: number, group: number, label: number, tokens: number[]) {
        const indicesOfSample = this.indicesOfEachSampleByLabelByGroup.get(sample);
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
            return tokensSet.has(idx);
        });

        indicesOfSampleByLabelByGroup.length = 0;
        indicesOfSampleByLabelByGroup.push(...newIndices);
    }

    removeTokensFromAllLabels(sample: number, group: number, tokens: number[]) {
        for (let i = 0; i < this.getNumOfLabels(sample); ++i) {
            this.removeTokensOnLabel(sample, group, i, tokens);
        }
    }

    // load() {

    // }

    save() {
        if (this.onSave) {
            const dumped = Array.from(this.indicesOfEachSampleByLabelByGroup.entries())
                .map(([idx, indicesOfSample]) => JSON.stringify({ idx, match: indicesToMatch(indicesOfSample) }))
                .join('\n');

            this.onSave(dumped);
        }
    }
}

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

        selection.removeRange(range);

        const startSpan = targetSpans.find((span) => span.contains(startContainer));
        const endSpan = targetSpans.find((span) => span.contains(endContainer));
        if (startSpan && endSpan) {
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
function processCodeStyle(code: HTMLElement, onTokenSelectionChange?: (selectedTokenIndices: number[]) => void) {
    const targetSpans: HTMLElement[] = [];

    code.childNodes.forEach((node) => {
        if (node instanceof HTMLSpanElement){
            targetSpans.push(node);
        }
    });

    // deal with selected spans style changing
    let manualSelectionChange = false;

    const onWindowSelectionChange = () => {
        if (manualSelectionChange) {
            manualSelectionChange = false;
            return;
        }

        const selection = window.getSelection();
        if (focused && selection && selection.rangeCount > 0) {
            const selectedElements = new Set(getSelectedNodes(selection, Array.from(code.childNodes)));

            const selectedTokenIndices: number[] = [];
            targetSpans.forEach((span) => {
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
            targetSpans.forEach((span) => {
                span.classList.remove('selected');
            });
        }
    };
    document.addEventListener('selectionchange', onWindowSelectionChange);

    // deal with focus and unfocus
    let focused = false;

    const onWindowMouseDown = (e: MouseEvent) => {
        if (!mouseEventLiesIn(e, ...targetSpans)) {
            focused = false;
            targetSpans.forEach((span) => {
                span.classList.remove('selected');
            });
        }
    };
    window.addEventListener('mousedown', onWindowMouseDown);

    // detail: all the range of the covered spans are selected
    const onWindowMouseUp = () => {
        const selection = window.getSelection();
        if (focused && selection && selection.rangeCount > 0) {
            expandSelectedRanges(selection, targetSpans);
            manualSelectionChange = true;
        }
    };
    window.addEventListener('mouseup', onWindowMouseUp);

    const onEachSpanMouseDown = () => {
        focused = true;
    };
    targetSpans.forEach((span) => {
        span.addEventListener('mousedown', onEachSpanMouseDown);
    });

    return () => {
        document.removeEventListener('selectionchange', onWindowSelectionChange);
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
            processCodeStyle(codeRef.current, onTokenSelectionChange);
        }
    }, [code, groupColors, groupedTokenIndices, tokens]);

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
    const [newLabelColor, setNewLabelColor] = useState('#000000');
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
                        onClick={() => onClickLabel?.(-1)}
                    >
                        No Label
                    </Badge>
                    {labels.map((label, index) => (
                        <Badge
                            key={index}
                            color={label.color}
                            variant="filled"
                            className='label-badge'
                            onClick={() => onClickLabel?.(index)}
                        >
                            {label.text}
                        </Badge>
                    ))}
                    <Badge
                        leftSection={<IconPlus style={{ width: rem(12), height: rem(12) }} />}
                        color='gray'
                        className='label-badge add-label'
                        onClick={() => setModalOpened(true)}
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
                <ColorInput
                    label="Label Color"
                    placeholder="Pick a color"
                    value={newLabelColor}
                    onChange={(value) => setNewLabelColor(value)}
                    style={{ marginTop: '15px' }}
                />
                <Group align="right" style={{ marginTop: '20px' }}>
                    <Button onClick={addLabel}>Add</Button>
                </Group>
            </Modal>
        </>
    );
};

function generateColorForLabels(num: number) {
    const standardColors: MantineColor[] = ['blue', 'green', 'red', 'yellow', 'orange', 'cyan', 'lime', 'pink', 'dark', 'gray', 'grape', 'violet', 'indigo', 'teal'];
    const colors: MantineColor[] = [];

    for (let i = 0; i < num; i++) {
        colors.push(standardColors[i % standardColors.length]);
    }

    return colors;
}

type Label = {
    text: string;
    color: string;
}

export function Feature() {
    // Options
    const [optionOutlineTokens, setOptionOutlineTokens] = useState(false);
    const [optionTokensDirectory, setOptionTokensDirectory] = useState(demoResultsDirectory);
    const [optionLocalServer, setOptionLocalServer] = useState(demoFileServer);

    // Data
    // const [sampleTokens, setSampleTokens] = useState<string[][]>(Array(30).fill(0).map((_, i) => [(i + 1).toString()]));
    // const [sampleLabelling, setSampleLabelling] = useState<string[]>([]);
    const labelingProvider = useRef<LabelingProvider>(new LabelingProvider('', (dumped) => {
        setDumpedString(dumped);
        setModalOpened(true);
        console.log(dumped);
    }));

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

    const setLabelofTokens = (group: number, label: number, tokens: number[]) => {
        if (label < 0) {
            labelingProvider.current.removeTokensFromAllLabels(currentSampleIndex, group, tokens);
        } else {
            labelingProvider.current.addTokensOnLabel(currentSampleIndex, group, label, tokens);
        }
    };

    const clickLabelCallback = (labelIndex: number) => {
        if (selectedCodeTokens.length > 0) {
            setLabelofTokens(codeGroup, labelIndex, selectedCodeTokens);
        }
        if (selectedCommentTokens.length > 0) {
            setLabelofTokens(commentGroup, labelIndex, selectedCommentTokens);
        }
    };

    // A test function of fetch
    const loadFileCallback = useCallback(() => {
        fetch(`${optionLocalServer}${demoLabelingFilePath}`)
            .then((response) => response.text())
            .then((data) => {
                console.log(data);
            })
            .catch((error) => {
                console.error('Cannot get json:', error);
            });
    }, [optionLocalServer]);

    // const searchSampleCallback = useCallback((values: string[]) => {
    //     const filteredValues: string[] = [];

    //     values.forEach((s) => {
    //         if (isNaN(parseInt(s)) || parseInt(s) < 1 || parseInt(s) > commentSamples.length) {
    //             return;
    //         }
    //         filteredValues.push(s);
    //     });

    //     setSelectedSampleIndices(filteredValues);
    // }, []);

    // Code Area
    const codeArea = (sample: Sample, labels: Label[], onTokenSelectionChange?: (selectedTokenIndices: number[]) => void) => {
        return (
            <CodeBlock
                code={sample.text}
                tokens={sample.tokens}
                groupedTokenIndices={sample.labelingRanges.map((ranges) => new Ranges(ranges).expand())}
                groupColors={labels.map((label) => label.color)}
                onTokenSelectionChange={onTokenSelectionChange}
            />
        );
    };

    // Data Loading
    useEffect(() => {
        // Set up labels and colors
        const numOfLabels = Math.max(
            commentSamples[currentSampleIndex].labelingRanges.length,
            codeSamples[currentSampleIndex].labelingRanges.length
        );
        const defaultGeneratedColors = generateColorForLabels(numOfLabels);

        setLabels(Array(numOfLabels).fill(0).map((_, i) => ({ text: `Label ${i + 1}`, color: defaultGeneratedColors[i] })));
    }, [currentSampleIndex]);

    const classList = ['feature-block'];
    if (optionOutlineTokens) {
        classList.push('outline-tokens');
    }

    const className = classList.join(' ');

    return (
        <div className={className} style={{ width: '960px' }}>
            <TextInput
                disabled={true}
                value={optionLocalServer}
                label='File Server'
                description='Local server providing access to file' />
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
                    total={commentSamples.length}
                    onChangeValue={setCurrentSampleIndex}
                />
            </Center>
            <Center>
                <AlignmentLabels
                    labels={labels}
                    setLabels={setLabels}
                    onClickLabel={clickLabelCallback}
                />
            </Center>
            <Group gap='sm' justify='center'>
                {codeArea(commentSamples[currentSampleIndex], labels, setSelectedCommentTokens)}
                {codeArea(codeSamples[currentSampleIndex], labels, setSelectedCodeTokens)}
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
                    <code>{dumpedString}</code>
                </pre>
            </Modal>
        </div>
    );
}
