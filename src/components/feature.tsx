import { Button, Flex, rem, ScrollArea, Space, TextInput, Group, Checkbox, Center, Modal, MantineColor, HoverCard, Text, List, Loader, Stack, NumberInput, Grid, Divider, Container, Title, Kbd, Popover, Badge, AspectRatio, Transition, ActionIcon, ColorPicker } from '@mantine/core';
import { IconInfoCircle, IconReload, IconSettings } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'highlight.js/styles/atom-one-light.min.css';
import { CodeBlock } from './CodeBlock';
import { NumberNavigation } from './NumberNavigation';
import { AlignmentLabels } from './AlignmentLabels';
import { LabelingProvider, LabeledTextSample, codeGroup, commentGroup, TeachersRelationshipProvider, isTeachersResult } from '../data/data';
import { tryStringifyJson } from '../utils';
import { getDefaultLabelColors, globalMakerConfigSchema, useSmartConfig } from '../config';
import { useClickOutside } from '@mantine/hooks';

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
    const config = useSmartConfig(globalMakerConfigSchema);

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
                setSaveModalOpened(true);
            }
        })
    );

    // Data Saving
    const [dumpedString, setDumpedString] = useState('');

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

    const generateColorForLabels = useCallback((colors: string[],n: number) => {
        const l = config.labelColors.length;

        const getColor = l <= 0
            ? () => '#ffffff'
            : (v: number, i: number) => colors[i % l];
        return new Array(n).fill(0).map(getColor);
    }, []);

    const setLabelsWithDefaultColor = (labels: DisplayedLabel[]) => {
        // FIXME should avoid modifying the original object, everywhere?
        labels.forEach((label, i) => {
            label.color = config.labelColors[i];
        });
        setLabels(labels);
    };

    useEffect(() => {
        if (!sampleExists) return;

        const numOfLabels = labelingProvider.getNumOfLabelsOnSample(currentIndex);
        const defaultGeneratedColors = generateColorForLabels(config.labelColors, numOfLabels);

        setLabels(Array(numOfLabels).fill(0).map((_, i) => ({ text: `Label ${i + 1}`, color: defaultGeneratedColors[i] })));
    }, [sampleExists, currentIndex, labelingProvider, config.labelColors]);

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
                setSaveModalOpened(true);
            }
        }));

        setSelectedCodeTokens([]);
        setSelectedCommentTokens([]);
    };

    const loadFileCallback = useCallback(() => {
        resetStates();

        // TODO optimization, don't load full/all samples into memory
        setLoaderOpened(true);
        (async () => {

            const path = config.tokensDirectory.endsWith('/') ? config.tokensDirectory.slice(0, -1) : config.tokensDirectory;
            const labelingData = await fetch(`/mock${path}/${config.labelingFile}`)
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
                fetchResponse(config.tokensDirectory, config.fullTextFile)
                    .then(readJsonLinesToList)
                    .then(jsonList => {
                        if (jsonList === undefined) return;
                        const data = jsonList.map((line) => JSON.parse(line.trim()));

                        const loadCode = fetchResponse(config.tokensDirectory, config.completeCodeTokensFile)
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
                        const loadComment = fetchResponse(config.tokensDirectory, config.completeCommentTokensFile)
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
                        
                        fetchResponse(config.tokensDirectory, config.teacherFile)
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

    }, [labelingProvider, config.tokensDirectory]);  // FIXME is nested useCallback ugly?

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
    if (config.outlineTokens) {
        classList.push('outline-tokens');
    }

    const className = classList.join(' ');

    const fileInfoBadge = (
        <HoverCard width={300} position="right" shadow="md" offset={{ crossAxis: 80 }}>
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
                            A code tokens file:<br/><b>{config.completeCodeTokensFile}</b>
                        </List.Item>
                        <List.Item>
                            A comment tokens file:<br/><b>{config.completeCommentTokensFile}</b>
                        </List.Item>
                        <List.Item>
                            A data file that contains full text of code and docstring:<br/><b>{config.fullTextFile}</b>
                        </List.Item>
                        <List.Item>
                            A labeling result file, which as array of labeling applied to a list of samples, will be shown below:<br/><b>{config.labelingFile}</b>
                        </List.Item>
                    </List>
                </Text>
            </HoverCard.Dropdown>
        </HoverCard>
    );

    const loadingOptions = useMemo(() => (
        <Flex align='flex-end'>
            <TextInput
                value={config.tokensDirectory}
                onChange={(event) => config.tokensDirectory = event.currentTarget.value}
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
    ), [config.tokensDirectory, loadFileCallback]);

    const displayOptions = useMemo(() => (
        <Group>
            <Checkbox
                checked={config.outlineTokens}
                onChange={(event) => { config.outlineTokens = event.currentTarget.checked; }}
                label='Outline Tokens'
            />
            <Checkbox
                checked={config.showTeacherSamples}
                onChange={(event) => { config.showTeacherSamples = event.currentTarget.checked; }}
                label='Show Teacher Samples'
            />
            <div style={{ flex: 1 }}></div>
            <Button
                className='settings-button'
                variant='transparent'
                p={0}
                h={40}
                onClick={() => { setMoreSettingsModalOpened(true); }}
            >
                More Settings
                <Space w='6'></Space>
                <IconSettings></IconSettings>
            </Button>
        </Group>
    ), [config.outlineTokens, config.showTeacherSamples]);

    const [saveModalOpened, setSaveModalOpened] = useState(false);

    const saveLabelingModal = (
        <Modal
            opened={saveModalOpened}
            onClose={() => setSaveModalOpened(false)}
            title="Dumped String"
            size="lg"
        >
            <Container p={0}>
                <pre style={{ overflow: 'hidden', padding: '0' }}>
                    <ScrollArea p='16px'>
                        <code>
                            {dumpedString}
                        </code>
                    </ScrollArea>
                </pre>
                <Space h='md' />
                <Group justify='flex-end'>
                    <Button
                        onClick={() => {
                            navigator.clipboard.writeText(dumpedString);
                            setSaveModalOpened(false);
                        }}
                    >Copy</Button>
                </Group>
            </Container>
        </Modal>
    );


    const navigationRow = useMemo(() => {
        return (currentIndex === undefined) ? null : (
            <>
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
                                onClick={() => labelingProvider.save()}
                            >
                                Save Labeling
                            </Button>
                        </Group>
                    </Grid.Col>
                </Grid>
            </>
        )
    }, [saveModalOpened, currentIndex, currentLabelingResultIndex, goToIndex, goToIndexError, labelingProvider, codeSamples, commentSamples, rawCodeSamples, rawCommentSamples]);  // TODO put codeSamples, commentSamples, rawCodeSamples, rawCommentSamples into one object to update

    // TODO add transition for this
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
                    return (
                        <Container key={i} p='0'>
                            <Stack key={i} gap='0' align='baseline' p='1em 0.1em 0.5em'>
                                <Title order={4} size='md' pb='0.2em' c='blue'>Teacher: {teacher.teacher_idx}</Title>
                                {
                                    Object.keys(teacher)
                                        .filter(key => key !== 'teacher_idx')
                                        .map((key, i) =>
                                            <Group
                                                key={i}
                                                p='0.2em 0'
                                                c='blue'
                                                gap='xs'
                                            >
                                                <Badge
                                                    color='blue'
                                                    radius='sm'
                                                    size='sm'
                                                >
                                                    { key }
                                                </Badge>
                                                <Text
                                                    size='sm'
                                                >
                                                    { tryStringifyJson(teacher[key]) }
                                                </Text>
                                            </Group>
                                        )
                                }
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
                teacherSamplesForCurrentIndex && teacherSamplesForCurrentIndex.length > 0
                    ?
                    <Container p='0 1em'>
                        <Title order={4} style={{ padding: '0 0 0.3em' }}>Teacher Samples</Title>
                        {teacherSamplesDisplay}
                    </Container>
                    :
                    <Center h='100'>
                        <Text c='gray'>
                            No teacher samples
                        </Text>
                    </Center>
            }
        </>
    );

    const optionalTeacherSamplesArea =
        <Transition
            mounted={config.showTeacherSamples}
            transition="fade"
            duration={400}
            timingFunction="ease"
        >
            {(styles) => <div style={styles}>{ teacherSamplesArea }</div>}
        </Transition>
        ;

    // const tagsArea = (
    //     <TagsInput
    //         value={selectedIndices}
    //         onChange={searchSampleCallback}
    //         label='Selected Samples'
    //         clearable
    //     >
    //     </TagsInput>
    // });
    
    const resetLabelColors = useCallback(() => {
        config.labelColors = getDefaultLabelColors();
    }, [])

    useEffect(() => {
        if (config.labelColors.length <= 0) {
            resetLabelColors();
        }
    }, []);

    const [moreSettingsModalOpened, setMoreSettingsModalOpened] = useState(false);
    const [activeColorIndex, setActiveColorIndex] = useState<number | null>(null);

    const [resetColorPopoverOpened, setResetColorPopoverOpened] = useState(false);
    const resetColorPopoverRef = useClickOutside(() => setResetColorPopoverOpened(false));
    
    const moreSettingsModal = (
        <Modal
            opened={moreSettingsModalOpened}
            onClose={() => {
                setMoreSettingsModalOpened(false);
                setActiveColorIndex(null);
            }}
            title="More Settings"
            size='lg'
        >
            <Stack p={0}>
                <Container p={0} w='100%'>
                    <Group gap={6} w='fit-content'>
                        <Text size='sm' fw={600}>Label Colors</Text>
                        <Popover
                            opened={resetColorPopoverOpened}
                            position='right'
                            withArrow
                            shadow='xs'
                            offset={{
                                mainAxis: 12,
                                crossAxis: -4
                            }}
                        >
                            <Popover.Target>
                                <Button
                                    w={18}
                                    h={18}
                                    color='black'
                                    p='0'
                                    onClick={() => setResetColorPopoverOpened(true)}
                                >
                                    <IconReload style={{ width: rem(12), height: rem(12) }}/>
                                </Button>
                            </Popover.Target>
                            <Popover.Dropdown ref={resetColorPopoverRef} p='6px 6px'>
                                <Group
                                    p={0}
                                    gap='xs'
                                >
                                    <Text size='sm' fw={600}>Reset all colors?</Text>
                                    <Button
                                        size='compact-xs'
                                        color='red'
                                        onClick={() => {
                                            resetLabelColors();
                                            setResetColorPopoverOpened(false);
                                        }}
                                    >
                                        Confirm
                                    </Button>
                                </Group>
                            </Popover.Dropdown>
                        </Popover>
                    </Group>
                    <Space h='sm'></Space>
                    <Group gap="xs" w='fit-content' justify='flex-start'>
                        {config.labelColors.map((color, index) => (
                            <Popover
                                key={index}
                                position="bottom"
                                shadow='xs'
                                withArrow
                                closeOnClickOutside
                                clickOutsideEvents={['mouseup', 'touchend']}
                                onOpen={() => {
                                    index === activeColorIndex ? setActiveColorIndex(null) : setActiveColorIndex(index);
                                }}
                                onClose={() => {
                                    setActiveColorIndex(null);
                                }}
                            >
                                <Popover.Target>
                                    <ActionIcon
                                        radius="sm"
                                        variant="filled"
                                        className='custom-color-watch'
                                        style={{
                                            width: '30px',
                                            height: '30px',
                                            backgroundColor: color,
                                            ...(index === activeColorIndex ? { border: '3px solid black' } : { outlineOffset: '3px' })
                                        }}
                                    >
                                        {index + 1}
                                    </ActionIcon>
                                </Popover.Target>
                                <Popover.Dropdown>
                                    <ColorPicker
                                        value={config.labelColors[index]}
                                        onChange={(newColor) => {
                                            const newColors = [...config.labelColors];
                                            if (index !== null) {
                                                newColors[index] = newColor;
                                            }
                                            config.labelColors = newColors;
                                        }}
                                        format="rgba"
                                    />
                                </Popover.Dropdown>
                            </Popover>))}
                    </Group>
                </Container>
                <TextInput
                    label="Full Text File"
                    placeholder="file that contains full text of code and comments"
                    value={config.fullTextFile}
                    onChange={(e) => { config.fullTextFile = e.target.value }}
                    onFocus={(e) => {e.target.select()}}
                />
                <Group p={0} grow justify='space-between'>
                    <TextInput
                        label="Code Tokens File"
                        placeholder="file with code tokens"
                        value={config.completeCodeTokensFile}
                        onChange={(e) => { config.completeCodeTokensFile = e.target.value }}
                        onFocus={(e) => {e.target.select()}}
                    />
                    <TextInput
                        label="Comment Tokens File"
                        placeholder="file with comment tokens"
                        value={config.completeCommentTokensFile}
                        onChange={(e) => { config.completeCommentTokensFile = e.target.value }}
                        onFocus={(e) => {e.target.select()}}
                    />
                </Group>
                <Group p={0} grow justify='space-between'>
                    <TextInput
                        label="Labeling File"
                        placeholder="file with concrete labeling"
                        value={config.labelingFile}
                        onChange={(e) => { config.labelingFile = e.target.value }}
                        onFocus={(e) => {e.target.select()}}
                    />
                    <TextInput
                        label="Teachers File"
                        placeholder= "file with teachers information"
                        value={config.teacherFile}
                        onChange={(e) => { config.teacherFile = e.target.value }}
                        onFocus={(e) => {e.target.select()}}
                    />
                </Group>
            </Stack>
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
            { optionalTeacherSamplesArea }
            
            { saveLabelingModal }
            { moreSettingsModal }
        </div>
    );
}
