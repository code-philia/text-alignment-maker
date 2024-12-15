import { Button, Flex, rem, ScrollArea, Space, TextInput, Group, Checkbox, Center, Modal, MantineColor, HoverCard, Text, List, Loader, Stack, NumberInput, Grid, Divider, Container, Title, Kbd, AspectRatio, Popover } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'highlight.js/styles/atom-one-light.min.css';
import { useCookie } from 'react-use';
import { CodeBlock } from './CodeBlock';
import { NumberNavigation } from './NumberNavigation';
import { AlignmentLabels } from './AlignmentLabels';
import { LabelingProvider, LabeledTextSample, codeGroup, commentGroup, TeachersRelationshipProvider, TeachersRelationship, isTeachersResult } from '../data';

const demoResultsDirectory = '';
const demoCompleteCodeTokensFile = 'tokenized_code_tokens_train.jsonl';
const demoCompleteCommentTokensFile = 'tokenized_comment_tokens_train.jsonl';
const demoTrainDataFile = 'train.jsonl';
const demoLabelingFile = 'sorted_labelling_sample_api.jsonl';
const demoTeacherFile = 'student_teacher_pairs.jsonl';

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
    const [cookieOutlineTokens, setCookieOutlineTokens] = useCookie('outline-tokens');
    const [cookieShowTeacherSamples, setCookieShowTeacherSamples] = useCookie('show-teacher-samples');
    
    // Cookie Loading
    const firstLoaded = useRef(true);

    // TODO don't use so many useEffect, and even both at cookie-end and real-prop-end
    useEffect(() => {
        if (firstLoaded.current && cookieTokensDirectory) {
            setOptionTokensDirectory(cookieTokensDirectory);
        }
    }, [cookieTokensDirectory]);    // TODO should this array be empty?
    useEffect(() => {
        if (firstLoaded.current && cookieOutlineTokens) {
            setOptionOutlineTokens(cookieOutlineTokens === 'true');
        }
    }, [cookieOutlineTokens]);
    useEffect(() => {
        if (firstLoaded.current && cookieShowTeacherSamples) {
            setOptionShowTeacherSamples(cookieShowTeacherSamples === 'true');
        }
    }, [cookieShowTeacherSamples]);

    useEffect(() => {
        if (firstLoaded.current) {
            firstLoaded.current = false;
        }
    });

    // Options
    const [optionTokensDirectory, setOptionTokensDirectory] = useState(demoResultsDirectory);
    const [optionOutlineTokens, setOptionOutlineTokens] = useState(true);
    const [optionShowTeacherSamples, setOptionShowTeacherSamples] = useState(false);

    useEffect(() => {
        if (!firstLoaded.current) {
            setCookieOutlineTokens(optionOutlineTokens.toString());
        }
    }, [optionOutlineTokens]);

    useEffect(() => {
        if (!firstLoaded.current) {
            setCookieShowTeacherSamples(optionShowTeacherSamples.toString());
        }
    }, [optionShowTeacherSamples]);

    // Data
    const [rawCodeSamples, setRawCodeSamples] = useState<LabeledTextSample[]>([]);
    const [rawCommentSamples, setRawCommentSamples] = useState<LabeledTextSample[]>([]);

    const [codeSamples, setCodeSamples] = useState<LabeledTextSample[]>([]);
    const [commentSamples, setCommentSamples] = useState<LabeledTextSample[]>([]);
    
    const [teachersProvider, setTeachersProvider] = useState(
        new TeachersRelationshipProvider({ })
    );

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

    const goToInput = useRef<HTMLInputElement>(null);

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

    const sampleExists = useMemo(() => {
        return getValidSample(codeSamples, currentIndex) && getValidSample(commentSamples, currentIndex);
    }, [currentIndex, codeSamples, commentSamples]);

    // TODO merge sample and raw sample together
    const rawSampleExists = useCallback((index: number) => {
        return getValidSample(rawCodeSamples, index) && getValidSample(rawCommentSamples, index);
    }, [rawCodeSamples, rawCommentSamples]);

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

    useEffect(() => {
        if (!sampleExists) return;

        const numOfLabels = labelingProvider.getNumOfLabelsOnSample(currentIndex);
        const defaultGeneratedColors = generateColorForLabels(numOfLabels);

        setLabels(Array(numOfLabels).fill(0).map((_, i) => ({ text: `Label ${i + 1}`, color: defaultGeneratedColors[i] })));
    }, [sampleExists, currentIndex, labelingProvider]);

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
        console.log('got you selected comment tokens', selectedCommentTokens);
        if (selectedCodeTokens.length > 0) {
            setLabelOfCodeTokens(label);
        }
        if (selectedCommentTokens.length > 0) {
            setLabelOfCommentTokens(label);
        }
    };

    // TODO can we add a custom hook (to reset each state by the function returned from that hook?)
    const resetStates = () => {
        setRawCodeSamples([]);
        setRawCommentSamples([]);
        setCodeSamples([]);
        setCommentSamples([]);
        
        setTeachersProvider(new TeachersRelationshipProvider({}));
        setLabelingProvider(new LabelingProvider({
            content: '',
            onSave: (dumped) => {
                setDumpedString(dumped);
                setModalOpened(true);
            }
        }));

        setSelectedCodeTokens([]);
        setSelectedCommentTokens([]);
    };

    const loadFileCallback = useCallback(() => {
        resetStates();

        // FIXME too long, too nested ← written by Copilot
        setCookieTokensDirectory(optionTokensDirectory);

        // TODO optimization, don't load full/all samples into memory
        setLoaderOpened(true);
        (async () => {

            const path = optionTokensDirectory.endsWith('/') ? optionTokensDirectory.slice(0, -1) : optionTokensDirectory;
            const labelingData = await fetch(`/mock${path}/${demoLabelingFile}`)
                .then((response) => {
                    if (!response.ok) {
                        throw new Error('Cannot fetch labeling file');
                    }

                    return response.text();
                })
                .then((data) => {
                    labelingProvider.load(data);
                    setLabelingProvider(labelingProvider.copy());

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

                                setRawCodeSamples(data.map((d, i) => {
                                    return {
                                        index: i,
                                        text: d['code'],
                                        tokens: codeTokenLists[i],
                                        labelingRanges: []
                                    };
                                }));

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

                                setRawCommentSamples(data.map((d, i) => {
                                    return {
                                        index: i,
                                        text: d['docstring'],
                                        tokens: commentTokenLists[i],
                                        labelingRanges: []
                                    };
                                }));

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
                        
                        fetchResponse(optionTokensDirectory, demoTeacherFile)
                            .then(readJsonLinesToList)
                            .then(jsonList => {
                                if (!jsonList) return;

                                const teacherData = jsonList.map((line) => JSON.parse(line.trim()));
                                if (!teacherData) return;

                                if (isTeachersResult(teacherData)) {
                                    setTeachersProvider(new TeachersRelationshipProvider({ data: teacherData }));
                                }   // TODO add error handling, either a popup or a dialog
                            });
                    });
            }
        })();

    }, [labelingProvider, optionTokensDirectory, setCookieTokensDirectory]);  // FIXME is nested useCallback ugly?

    // Code Area
    const codeArea = (sample: LabeledTextSample, labelingRanges: number[][], labels: DisplayedLabel[], onTokenSelectionChange?: (selectedTokenIndices: number[]) => void) => {
        return (
            <CodeBlock
                code={sample.text ?? ''}
                tokens={sample.tokens ?? []}
                groupedTokenIndices={labelingRanges}
                groupColors={labels.map((label) => label.color)}
                onTokenSelectionChange={onTokenSelectionChange}
            />
        );
    };

    const codeAreaForRawSampleIndex = (index: number, group: number) => {
        if (!rawSampleExists(index)) {
            return null;
        }

        // FIXME the sample is searched for twice, should be optimized
        const sample = getValidSample(group === codeGroup ? rawCodeSamples : rawCommentSamples, index);
        return codeAreaForSample(
            sample!,
            labelingProvider.getTokensOnGroup(index, group) ?? []
        );
    };

    const codeAreaForSample = (sample: LabeledTextSample | undefined, labelingRanges: number[][], selectionCallback: typeof setSelectedCodeTokens = () => { }) => {
        return sample ? codeArea(
            sample,
            labelingRanges,
            labels,
            selectionCallback
        ) : null;
    };

    const codeAreaForCurrentIndexForCodeOrComment = (group: number) => {
        if (!sampleExists) {
            return null;
        }

        const sample = getValidSample(group === codeGroup ? codeSamples : commentSamples, currentIndex);
        return codeAreaForSample(
            sample!,
            labelingProvider.getTokensOnGroup(currentIndex, group) ?? [],
            group === codeGroup ? setSelectedCodeTokens : setSelectedCommentTokens
        );
    };

    const codeAreaForComment = useMemo(() => codeAreaForCurrentIndexForCodeOrComment(commentGroup), [currentIndex, commentSamples, labels, labelingProvider]);
    const codeAreaForCode = useMemo(() => codeAreaForCurrentIndexForCodeOrComment(codeGroup), [currentIndex, codeSamples, labels, labelingProvider]);

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
            <HoverCard.Dropdown style={{ padding: '1.5em' }}>
                <Text size='xs'>
                    The following files are required:
                    <Space h='xs' />
                    <List size='xs' spacing='5'>
                        <List.Item>
                            A code tokens file:<br/><b>{demoCompleteCodeTokensFile}</b>
                        </List.Item>
                        <List.Item>
                            A comment tokens file:<br/><b>{demoCompleteCommentTokensFile}</b>
                        </List.Item>
                        <List.Item>
                            A Training file that contains code and docstring:<br/><b>{demoTrainDataFile}</b>
                        </List.Item>
                        <List.Item>
                            A labeling result file, which as array of labeling applied to a list of samples, will be shown below:<br/><b>{demoLabelingFile}</b>
                        </List.Item>
                    </List>
                </Text>
            </HoverCard.Dropdown>
        </HoverCard>
    );

    const loadingOptions = useMemo(() => (
        <Flex align='flex-end'>
            <TextInput
                value={optionTokensDirectory}
                onChange={(event) => setOptionTokensDirectory(event.currentTarget.value)}
                label='Result directory'
                description={<>Directory that contains original text, tokens, and labeling files{fileInfoBadge}</>}
                style={{ flexGrow: 1 }}
                onKeyDown={
                    (e) => {
                        if (e.key === 'Enter' && !(e.ctrlKey || e.shiftKey)) {
                            loadFileCallback();
                        }
                    }
                }
            />
            <Space w='sm'></Space>
            <Button onClick={loadFileCallback}>Load</Button>
        </Flex>
    ), [optionTokensDirectory, loadFileCallback]);

    const displayOptions = useMemo(() => (
        <Group>
            <Checkbox
                checked={optionOutlineTokens}
                onChange={(event) => setOptionOutlineTokens(event.currentTarget.checked)}
                label='Outline Tokens'
            />
            <Checkbox
                checked={optionShowTeacherSamples}
                onChange={(event) => setOptionShowTeacherSamples(event.currentTarget.checked)}
                label='Show Teacher Samples'
            />
        </Group>
    ), [optionOutlineTokens, optionShowTeacherSamples]);

    const navigationRow = useMemo(() => {
        return (currentIndex === undefined) ? null : (
            <Grid align='center' style={{ gridTemplateColumns: 'min-content 1fr min-content' }}>
                <Grid.Col span={2.8}>
                    <Group gap='xs' align='center'>
                        <Popover
                            position='bottom'
                            withArrow shadow='md'
                            trapFocus
                        >
                            <Popover.Target>
                                <Button>
                                    Go to index
                                </Button>
                            </Popover.Target>
                            <Popover.Dropdown>
                                <NumberInput
                                    ref={goToInput}
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
                                    rightSection={
                                        <Kbd w='19' h='22' p='0'>
                                            <Center p='0'>
                                                ↵
                                            </Center>
                                        </Kbd>
                                    }
                                    rightSectionWidth={34}
                                    onFocus={() => { goToInput.current?.select(); }}
                                >
                                </NumberInput>
                            </Popover.Dropdown>
                        </Popover>
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
        )
    }, [currentIndex, currentLabelingResultIndex, goToIndex, goToIndexError, labelingProvider, codeSamples, commentSamples, rawCodeSamples, rawCommentSamples]);  // TODO put codeSamples, commentSamples, rawCodeSamples, rawCommentSamples into one object to update

    const textLabelingArea = useMemo(() => (
        loaderOpened
            ?
            <Center h='300'>
                <Stack align='center' gap='xs'>
                    <Text c='blue'>Loading Tokens...</Text>
                    <Loader size='lg' color='blue' type='dots'/>
                </Stack>
            </Center>
            :
        currentIndex
            ?
            <Container p='0'>
                <Center>
                    <AlignmentLabels
                        labels={labels}
                        setLabels={setLabelsWithDefaultColor}
                        onClickLabel={clickLabelCallback}
                    />
                </Center>
                <Container p='0 1em'>
                    <Title order={4} style={{ padding: '0.3em 0' }}>Sample: {currentIndex}</Title>
                    <Group gap='sm' justify='space-between'>
                        {codeAreaForComment}
                        {codeAreaForCode}
                    </Group>
                </Container>
            </Container>
            :
            <Center h='300'>
                <Text c='gray'>
                    No instance is loaded
                </Text>
            </Center>
    ), [loaderOpened, currentIndex, labels, codeAreaForComment, codeAreaForCode, clickLabelCallback]);

    const getTeacherSamples = useCallback((idx: number) => {
        return teachersProvider.getTeachers(idx);
    }, [teachersProvider]);
    
    const teacherSamplesForCurrentIndex = useMemo(() => {
        return getTeacherSamples(currentIndex);
    }, [currentIndex, teachersProvider, getTeacherSamples]);

    const teacherSamplesDisplay = useMemo(() => {
        return teacherSamplesForCurrentIndex
            ?
            teacherSamplesForCurrentIndex.map(
                (teacher, i) => {
                    const teacherSampleComment = getValidSample(rawCommentSamples, teacher.teacher_idx);
                    const teacherSampleCode = getValidSample(rawCodeSamples, teacher.teacher_idx);
                    if (!teacherSampleComment || !teacherSampleCode) {
                        return null;
                    }

                    return (
                        <Container key={i} p='0'>
                            <Stack key={i} gap='0' align='baseline' p='0.5em 0.1em'>
                                <Title order={4} size='sm'>Teacher: {teacher.teacher_idx}</Title>
                                <Text size='sm'>Pattern: {teacher.pattern}</Text>
                                <Text size='sm'>Cluster: {teacher.cluster}</Text>
                            </Stack>
                            <Group gap='sm' justify='space-between'>
                                {codeAreaForRawSampleIndex(teacher.teacher_idx, commentGroup)}
                                {codeAreaForRawSampleIndex(teacher.teacher_idx, codeGroup)}
                            </Group>
                            <Space h='md'></Space>
                        </Container>
                    );
                }
            )
            :
            null;
    }, [teacherSamplesForCurrentIndex, rawCodeSamples, rawCommentSamples]);
    
    const teacherSamplesArea = (
        <>
            <Space h='xl'></Space>
            <Divider></Divider>
            <Space h='xl'></Space>
            {
                teacherSamplesForCurrentIndex
                    ?
                    <Container p='0 1em'>
                        <Title order={4} style={{ padding: '0 0 0.3em' }}>Teacher Samples</Title>
                        {teacherSamplesDisplay}
                    </Container>
                    :
                    <Center h='300'>
                        <Text c='gray'>
                            No teacher samples
                        </Text>
                    </Center>
            }
        </>
    );

    // const tagsArea = (
    //     <TagsInput
    //         value={selectedIndices}
    //         onChange={searchSampleCallback}
    //         label='Selected Samples'
    //         clearable
    //     >
    //     </TagsInput>
    // });
    
    const saveLabelingModal = (
        <Modal
            opened={modalOpened}
            onClose={() => setModalOpened(false)}
            title="Dumped String"
            size="lg"
        >
            <pre style={{ overflow: 'hidden', padding: '0' }}>
                <ScrollArea p='10px'>
                    <code>
                        {dumpedString}
                    </code>
                </ScrollArea>
            </pre>
            <Space h='sm' />
            <Button
                onClick={() => {
                    navigator.clipboard.writeText(dumpedString);
                    setModalOpened(false);
                }}
            >Copy</Button>
        </Modal>
    );

    return (
        <div className={className} style={{ width: '960px' }}>
            { loadingOptions }
            <Space h='sm'></Space>
            { displayOptions }
            <Space h='md'></Space>
            <Divider />
            <Space h='md'></Space>
            { navigationRow }
            <Space h='lg'></Space>
            { textLabelingArea }
            { teacherSamplesArea }
            
            { saveLabelingModal }
        </div>
    );
}
