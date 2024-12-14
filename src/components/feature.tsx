import { Button, Flex, rem, ScrollArea, Space, TextInput, Group, Checkbox, Center, Modal, MantineColor, HoverCard, Text, List, Loader, Stack, NumberInput, Grid, Divider } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import 'highlight.js/styles/atom-one-light.min.css';
import { useCookie } from 'react-use';
import { CodeBlock } from './CodeBlock';
import { NumberNavigation } from './NumberNavigation';
import { AlignmentLabels } from './AlignmentLabels';
import { LabelingProvider, LabeledTextSample, codeGroup, commentGroup } from '../data';

const demoResultsDirectory = '';
const demoCompleteCodeTokensFile = 'tokenized_code_tokens_train.jsonl';
const demoCompleteCommentTokensFile = 'tokenized_comment_tokens_train.jsonl';
const demoTrainDataFile = 'train.jsonl';
const demoLabelingFilePath = 'sorted_labelling_sample_api.jsonl';

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

type DisplayedLabel = {
    text: string;
    color: string;
}

function setLabelOfTokens(sampleIndex: number, group: number, label: number, tokens: number[], provider: LabelingProvider, samples: LabeledTextSample[], setSamples: (s: LabeledTextSample[]) => void) {
    const sample = samples[sampleIndex];

    if (label < 0) {
        provider.removeTokensFromAllLabels(sample.index, group, tokens);
    } else {
        provider.changeTokensToLabel(sample.index, group, label, tokens);
    }
    setSamples([
        ...samples.slice(0, sampleIndex),
        {
            ...sample,
            labelingRanges: provider.getTokensOnGroup(sample.index, group) ?? []
        },
        ...samples.slice(sampleIndex + 1)
    ]);
};

function fetchResponse(dirAbsPath: string, fileName: string) {
    const path = dirAbsPath.endsWith('/') ? dirAbsPath.slice(0, -1) : dirAbsPath;
    return fetch(`/mock${path}/${fileName}`)
        .then((response) => {
            if (!response.ok) {
                throw new Error('Cannot fetch file: ' + fileName);
            }

            return response;
        })
        .catch((error) => {
            console.error('Cannot get response:', error);
        });
}

function readJsonLinesToList(res: Response | void): Promise<string[]> | undefined{
    if (!res || (!res.body)) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const result: string[] = [];
    let buffer = '';

    return reader.read().then(function processText({ done, value }): string[] | Promise<string[]> {
        if (done) {
            if (buffer) {
                result.push(buffer);
            }
            return result;
        }

        const text = buffer + decoder.decode(value, { stream: true });
        const lines = text.split('\n');
        buffer = lines.pop() || ''; // Store incomplete line in buffer
        result.push(...lines);

        return reader.read().then(processText);
    });
}

export function Feature() {
    // Stored Options
    const [cookieTokensDirectory, setCookieTokensDirectory] = useCookie('tokens-directory');

    // Cookie Loading
    useEffect(() => {
        if (cookieTokensDirectory) {
            setOptionTokensDirectory(cookieTokensDirectory);
        }
    }, [cookieTokensDirectory]);

    // Options
    const [optionOutlineTokens, setOptionOutlineTokens] = useState(true);
    const [optionTokensDirectory, setOptionTokensDirectory] = useState(demoResultsDirectory);

    // Data
    const [codeSamples, setCodeSamples] = useState<LabeledTextSample[]>([]);
    const [commentSamples, setCommentSamples] = useState<LabeledTextSample[]>([]);

    const [labelingProvider, setLabelingProvider] = useState(
        new LabelingProvider({
            content: '',
            onSave: (dumped) => {
                setDumpedString(dumped);
                setModalOpened(true);
            }
        })
    );

    // Data Saving
    const [dumpedString, setDumpedString] = useState('');
    const [modalOpened, setModalOpened] = useState(false);

    // Loading
    const [loaderOpened, setLoaderOpened] = useState(false);

    // Navigation
    const [currentLabelingResultIndex, setCurrentSampleIndex] = useState(0);     // !! THIS IS the index from all labeling results !!
    // const [selectedIndices, setSelectedSampleIndices] = useState<string[]>([]);
    const [goToIndex, setGoToIndex] = useState<string | number>(0);
    const [goToIndexError, setGoToIndexError] = useState<boolean>(false);

    const handleGoTo = () => {
        if (!(typeof goToIndex === 'number')) return;

        const targetLabeling = labelingProvider.getSampleIndices().findIndex((i) => i === goToIndex);
        if (targetLabeling > 0) {
            setCurrentSampleIndex(targetLabeling);
            setGoToIndexError(false);
        } else {
            setGoToIndexError(true);
            setTimeout(() => {
                setGoToIndexError(false);
            }, 800);
        }
    };

    // Valid State Detection
    const currentIndex = useMemo(() => {
        return labelingProvider.getSampleIndices()[currentLabelingResultIndex];
    }, [currentLabelingResultIndex, labelingProvider]);

    const getValidSample = (samples: LabeledTextSample[], index: number): LabeledTextSample | undefined => {
        return samples.find((sample) => sample.index === index);
    };

    const sampleExists = useCallback(() => {
        return getValidSample(codeSamples, currentIndex) && getValidSample(codeSamples, currentIndex);
    }, [codeSamples, currentIndex]);

    // Labeling
    const [labels, setLabels] = useState<DisplayedLabel[]>([]);
    const [selectedCodeTokens, setSelectedCodeTokens] = useState<number[]>([]);
    const [selectedCommentTokens, setSelectedCommentTokens] = useState<number[]>([]);

    const setLabelsWithDefaultColor = (labels: DisplayedLabel[]) => {
        // FIXME should avoid modifying the original object, everywhere?
        labels.forEach((label, i) => {
            label.color = generateColorForLabelIndex(i);
        });
        setLabels(labels);
    };

    const updateLabelingProvider = useCallback(() => {
        if (!sampleExists()) return;

        const numOfLabels = labelingProvider.getNumOfLabelsOnSample(currentIndex);
        const defaultGeneratedColors = generateColorForLabels(numOfLabels);

        setLabels(Array(numOfLabels).fill(0).map((_, i) => ({ text: `Label ${i + 1}`, color: defaultGeneratedColors[i] })));
    }, [currentIndex, labelingProvider, sampleExists]);

    const setLabelOfCodeTokens = useCallback((label: number) => {
        setLabelOfTokens(
            currentLabelingResultIndex,
            codeGroup,
            label,
            selectedCodeTokens,
            labelingProvider,
            codeSamples,
            setCodeSamples
        );
    }, [currentLabelingResultIndex, selectedCodeTokens, codeSamples, labelingProvider]);

    const setLabelOfCommentTokens = useCallback((label: number) => {
        setLabelOfTokens(
            currentLabelingResultIndex,
            commentGroup,
            label,
            selectedCommentTokens,      // TODO can we decouple "code and comment" to any multiple groups?
            labelingProvider,
            commentSamples,
            setCommentSamples
        );
    }, [currentLabelingResultIndex, selectedCommentTokens, commentSamples, labelingProvider]);

    const clickLabelCallback = (label: number) => {
        if (selectedCodeTokens.length > 0) {
            setLabelOfCodeTokens(label);
        }
        if (selectedCommentTokens.length > 0) {
            setLabelOfCommentTokens(label);
        }
    };

    const loadFileCallback = useCallback(() => {
        // FIXME too long, too nested ← written by Copilot
        setCookieTokensDirectory(optionTokensDirectory);

        // TODO optimization, don't load full/all samples into memory
        setLoaderOpened(true);
        (async () => {

            const path = optionTokensDirectory.endsWith('/') ? optionTokensDirectory.slice(0, -1) : optionTokensDirectory;
            const labelingData = await fetch(`/mock${path}/${demoLabelingFilePath}`)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error('Cannot fetch labeling file');
                    }

                    return response.text();
                })
                .then((data) => {
                    labelingProvider.load(data);
                    setLabelingProvider(labelingProvider.copy());
                    updateLabelingProvider();   // FIXME is this line necessary to trigger update?

                    return data;
                })
                .catch((error) => {
                    console.error('Cannot get json:', error);
                    setLoaderOpened(false);
                });

            // FIXME too long nested, too many parenthesis
            if (labelingData !== undefined) {
                fetchResponse(optionTokensDirectory, demoTrainDataFile)
                    .then(readJsonLinesToList)
                    .then(jsonList => {
                        if (jsonList === undefined) return;
                        const data = jsonList.map((line) => JSON.parse(line.trim()));

                        const loadCode = fetchResponse(optionTokensDirectory, demoCompleteCodeTokensFile)
                            .then(readJsonLinesToList)
                            .then(jsonList => {
                                if (!jsonList) return;

                                const codeTokenLists = jsonList.map((line) => JSON.parse(line.trim()));
                                if (!codeTokenLists) return;

                                setCodeSamples(labelingProvider.getSampleIndices().map((i: number) => {
                                    return {
                                        index: i,
                                        text: data[i]['code'],
                                        tokens: codeTokenLists[i],
                                        labelingRanges: labelingProvider.getTokensOnGroup(i, codeGroup) ?? []
                                    };
                                }));
                            });
                        const loadComment = fetchResponse(optionTokensDirectory, demoCompleteCommentTokensFile)
                            .then(readJsonLinesToList)
                            .then(jsonList => {
                                if (!jsonList) return;

                                const commentTokenLists = jsonList.map((line) => JSON.parse(line.trim()));
                                if (!commentTokenLists) return;

                                setCommentSamples(labelingProvider.getSampleIndices().map((i: number) => {
                                    return {
                                        index: i,
                                        text: data[i]['docstring'],
                                        tokens: commentTokenLists[i],
                                        labelingRanges: labelingProvider.getTokensOnGroup(i, commentGroup) ?? []
                                    };
                                }));
                            });
                        Promise.all([loadCode, loadComment])
                            .catch((error) => {
                                console.error('Error while loading tokens: ', error);
                            })
                            .then(() => {
                                setLoaderOpened(false);
                            });
                    });
            }
        })();

    }, [labelingProvider, optionTokensDirectory, setCookieTokensDirectory, updateLabelingProvider]);  // FIXME is nested useCallback ugly?

    // Code Area
    const codeArea = (sample: LabeledTextSample, labelingRanges: number[][], labels: DisplayedLabel[], onTokenSelectionChange?: (selectedTokenIndices: number[]) => void) => {
        return (
            <CodeBlock
                code={sample.text ?? ''}
                tokens={sample.tokens ?? []}
                groupedTokenIndices={labelingRanges}
                groupColors={labels.map((label) => label.color)}
                onTokenSelectionChange={(s: number[]) => {
                    onTokenSelectionChange?.(s);
                }}
            />
        );
    };

    const codeAreaForComment = useMemo(() => {
        if (!sampleExists()) {
            return null;
        }
        return codeArea(
            getValidSample(commentSamples, currentIndex)!,
            labelingProvider.getTokensOnGroup(currentIndex, commentGroup) ?? [],
            labels,
            setSelectedCommentTokens
        );
    }, [sampleExists, commentSamples, currentIndex, labelingProvider, labels]);

    const codeAreaForCode = useMemo(() => {
        if (!sampleExists()) {
            return null;
        }
        return codeArea(
            getValidSample(codeSamples, currentIndex)!,
            labelingProvider.getTokensOnGroup(currentIndex, codeGroup) ?? [],
            labels,
            setSelectedCodeTokens
        );
    }, [sampleExists, codeSamples, currentIndex, labelingProvider, labels]);

    // Data Loading
    useEffect(() => {
        // Set up labels and colors
        updateLabelingProvider();
    }, [currentLabelingResultIndex, updateLabelingProvider]);   // FIXME why should we call again here, after rendering all the code?

    const classList = ['feature-block'];
    if (optionOutlineTokens) {
        classList.push('outline-tokens');
    }

    const className = classList.join(' ');

    const fileInfoBadge = (
        <HoverCard width={300} position="right" shadow="md">
            <HoverCard.Target>
                <Button variant='transparent' size='compact-xs' style={{ padding: '3px', cursor: 'unset'}}>
                    <IconInfoCircle style={{ width: rem(12), height: rem(12) }}/>
                </Button>
            </HoverCard.Target>
            <HoverCard.Dropdown>
                <Text size='xs'>
                    The following files are required:
                    <Space h='xs' />
                    <List size='xs'>
                        <List.Item>
                            A code tokens file <b>tokenized_code_tokens_train.jsonl</b>
                        </List.Item>
                        <List.Item>
                            A comment tokens file <b>tokenized_comment_tokens_train.jsonl</b>
                        </List.Item>
                        <List.Item>
                            A Training file <b>labeling.jsonl</b> that contains code and docstring
                        </List.Item>
                        <List.Item>
                            A labeling result file <b>sorted_labelling_sample_api.jsonl</b>, which determines the list below
                        </List.Item>
                    </List>
                </Text>
            </HoverCard.Dropdown>
        </HoverCard>
    );

    return (
        <div className={className} style={{ width: '960px' }}>
            <Flex align='flex-end'>
                <TextInput
                    value={optionTokensDirectory}
                    onChange={(event) => setOptionTokensDirectory(event.currentTarget.value)}
                    label='Result directory'
                    description={<>Directory that contains original text, tokens, and labeling files{fileInfoBadge}</>}
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
                    label='Outline Tokens'
                />

            </Group>
            <Space h='md'></Space>
            <Grid align='center' style={{ gridTemplateColumns: 'min-content 1fr min-content' }}>
                <Grid.Col span={2.8}>
                    <Group gap='xs' align='center'>
                        <Button
                            onClick={handleGoTo}
                        >
                            Go to
                        </Button>
                        <NumberInput
                            value={goToIndex}
                            min={0}
                            onChange={(value) => setGoToIndex(value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !(e.ctrlKey || e.shiftKey)) {
                                    handleGoTo();
                                }
                            }}
                            error={goToIndexError}
                            w='90'
                        >
                        </NumberInput>
                    </Group>
                </Grid.Col>
                <Grid.Col span={6.4}>
                    <Center>
                        <NumberNavigation
                            value={currentLabelingResultIndex}
                            total={labelingProvider.getSampleIndices().length}
                            onChangeValue={setCurrentSampleIndex}
                            tags={labelingProvider.getSampleIndices().map((i) => i.toString())}
                        />
                    </Center>
                </Grid.Col>
                <Grid.Col span={2.8}>
                    <Group justify='flex-end'>
                        <Button
                            w='11em'
                            onClick={() => labelingProvider.save()}
                        >
                            Save Labeling
                        </Button>
                    </Group>
                </Grid.Col>
            </Grid>
            <Space h='lg' />
            <Divider />
            <Center>
                <AlignmentLabels
                    labels={labels}
                    setLabels={setLabelsWithDefaultColor}
                    onClickLabel={clickLabelCallback}
                />
            </Center>
            {
                loaderOpened
                    ?
                    <Center h='300'>
                        <Stack align='center' gap='xs'>
                            <Text c='blue'>Loading Tokens...</Text>
                            <Loader size='lg' color='blue' type='dots'/>
                        </Stack>
                    </Center>
                    :
                    <Group gap='sm' justify='center'>
                        {codeAreaForComment}
                        {codeAreaForCode}
                    </Group>
            }
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
                <pre style={{ overflow: 'hidden' }}>
                    <ScrollArea >
                        <code>
                            {dumpedString}
                        </code>
                    </ScrollArea>
                </pre>
                <Space h='sm'/>
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
