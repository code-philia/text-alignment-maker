import { Button, Flex, rem, ScrollArea, Space, TextInput, Group, Checkbox, Center, Modal, MantineColor, HoverCard, Text, List, Loader, Stack, NumberInput, Grid, Divider, Container, Title, Kbd, Popover, Badge, AspectRatio, Transition, ActionIcon, ColorPicker } from '@mantine/core';
import { IconInfoCircle, IconReload, IconRobot, IconSettings } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import 'highlight.js/styles/atom-one-light.min.css';
import { CodeBlock } from './CodeBlock';
import { NumberNavigation } from './NumberNavigation';
import { AlignmentLabels } from './AlignmentLabels';
import { LabelingProvider, LabeledTextSample, codeGroup, commentGroup, TeachersRelationshipProvider, isTeachersResult, HighlightSample } from '../data/data';
import { matchToIndices, tryStringifyJson } from '../utils';
import { getDefaultLabelColors, globalMakerConfigSchema, globalMakerConfigSettersContext, useSmartConfig, WritableConfig } from '../config';
import { useClickOutside } from '@mantine/hooks';
import { LabeledCodeCommentSample, TokenAlignmentModal } from './ModelQueryModal';

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

function readLocalFile(dirAbsPath: string, fileName: string) {
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

function readJsonLinesToList(res: Response | void): Promise<string[]> | undefined {
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

async function readLocalFileAsJsonLines(dirAbsPath: string, fileName: string): Promise<string[] | undefined> {
    return readLocalFile(dirAbsPath, fileName).then(readJsonLinesToList);
}

export function Feature() {
    const config = useSmartConfig(globalMakerConfigSchema, globalMakerConfigSettersContext);

    // Data
    const [rawCodeSamples, setRawCodeSamples] = useState<LabeledTextSample[]>([]);
    const [rawCommentSamples, setRawCommentSamples] = useState<LabeledTextSample[]>([]);

    const [codeSamples, setCodeSamples] = useState<LabeledTextSample[]>([]);
    const [commentSamples, setCommentSamples] = useState<LabeledTextSample[]>([]);

    const [teachersProvider, setTeachersProvider] = useState(
        new TeachersRelationshipProvider({})
    );

    const [highlightSamples, setHighlightSamples] = useState<HighlightSample[]>([]);

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

    const generateColorForLabels = useCallback((colors: string[], n: number) => {
        const l = colors.length;

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
        const codeSelection = selectedCodeTokens.slice();
        const commentSelection = selectedCommentTokens.slice();

        if (selectedCodeTokens.length > 0) {
            setLabelOfCodeTokens(label);
            setSelectedCodeTokens(codeSelection);
        }

        if (selectedCommentTokens.length > 0) {
            setLabelOfCommentTokens(label);
            setSelectedCommentTokens(commentSelection);
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
            const labelingData = readLocalFile(config.tokensDirectory, config.labelingFile)
                .then((res) => {
                    if (!res) {
                        throw new Error('Cannot fetch labeling file');
                    }

                    return res.text();
                })
                .then(data => {
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
                readLocalFileAsJsonLines(config.tokensDirectory, config.fullTextFile)
                    .then(jsonList => {
                        if (jsonList === undefined) return;

                        const data = jsonList.map((line) => JSON.parse(line.trim()));

                        const loadCode = readLocalFileAsJsonLines(config.tokensDirectory, config.completeCodeTokensFile)
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

                        const loadComment = readLocalFileAsJsonLines(config.tokensDirectory, config.completeCommentTokensFile)
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

                        readLocalFileAsJsonLines(config.tokensDirectory, config.teacherFile)
                            .then(jsonList => {
                                if (!jsonList) return;

                                const teacherData = jsonList.map((line) => JSON.parse(line.trim()));
                                if (!teacherData) return;

                                if (isTeachersResult(teacherData)) {
                                    setTeachersProvider(new TeachersRelationshipProvider({ data: teacherData }));
                                }   // TODO add error handling, either a popup or a dialog
                            });
                        
                        readLocalFileAsJsonLines(config.tokensDirectory, config.highlightFile)
                            .then(jsonList => {
                                if (!jsonList) return;

                                const highlightData = jsonList.map((line) => JSON.parse(line.trim()));
                                if (!highlightData) return;

                                setHighlightSamples(highlightData.map((d, i) => {
                                    return {
                                        index: d['sample_idx'],
                                        highlightTokenIndices: d['highlight'].map((x: any) => [x['code_indices'], x['nl_indices']]),
                                        highlightTokenScores: d['highlight'].map((x: any) => [x['code_scores'], x['nl_scores']])
                                    };
                                }));
                            });
                    });
            }
        })();

    }, [labelingProvider, config.tokensDirectory]);  // FIXME is nested useCallback ugly?

    // Code Area
    const codeArea = (sample: LabeledTextSample, labelingRanges: number[][], highlightIndices: number[][], highlightScores: number[][], labels: DisplayedLabel[], selected: number[], onTokenSelectionChange?: (selectedTokenIndices: number[]) => void) => {
        return (
            <CodeBlock
                code={sample.text ?? ''}
                tokens={sample.tokens ?? []}
                groupedTokenIndices={labelingRanges}
                highlightedTokenIndices={highlightIndices}
                highlightedTokenScores={config.showExternalLabelingScore ? highlightScores : undefined}
                groupColors={labels.map((label) => label.color)}
                selected={selected}
                onTokenSelectionChange={onTokenSelectionChange}
            />
        );
    };

    const codeAreaForSample = (sample: LabeledTextSample | undefined, labelingRanges: number[][], highlightIndices: number[][], highlightScores: number[][], selected: number[], selectionCallback: typeof setSelectedCodeTokens = () => { }) => {
        return sample ? codeArea(
            sample,
            labelingRanges,
            highlightIndices,
            highlightScores,
            labels,
            selected,
            selectionCallback
        ) : null;
    };

    const codeAreaForRawSampleIndex = (index: number, group: number) => {
        if (!rawSampleExists(index)) {
            return null;
        }

        // FIXME the sample is searched for twice, should be optimized
        const sample = getValidSample(group === codeGroup ? rawCodeSamples : rawCommentSamples, index);
        return codeAreaForSample(
            sample!,
            labelingProvider.getTokensOnGroup(index, group) ?? [],
            [],
            [],
            []
        );
    };

    const codeAreaForCurrentIndexForCodeOrComment = (group: number) => {
        if (!sampleExists) {
            return null;
        }

        const sample = getValidSample(group === codeGroup ? codeSamples : commentSamples, currentIndex);
        return codeAreaForSample(
            sample!,
            labelingProvider.getTokensOnGroup(currentIndex, group) ?? [],
            highlightSamples
                .find((h => h.index === currentIndex))
                ?.highlightTokenIndices
                .map(highlightGroup => highlightGroup[group])
            ?? [],
            highlightSamples
                .find((h => h.index === currentIndex))
                ?.highlightTokenScores
                .map(highlightGroup => highlightGroup[group])
            ?? [],
            group === codeGroup ? selectedCodeTokens : selectedCommentTokens,
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
                <Button variant='transparent' size='compact-xs' style={{ padding: '3px', cursor: 'unset' }}>
                    <IconInfoCircle style={{ width: rem(12), height: rem(12) }} />
                </Button>
            </HoverCard.Target>
            <HoverCard.Dropdown style={{ padding: '1.5em' }}>
                <Container p='0' size='xs'>
                    The following files are required:
                    <Space h='xs' />
                    <List size='xs' spacing='5'>
                        <List.Item>
                            A code tokens file:<br /><b>{config.completeCodeTokensFile}</b>
                        </List.Item>
                        <List.Item>
                            A comment tokens file:<br /><b>{config.completeCommentTokensFile}</b>
                        </List.Item>
                        <List.Item>
                            A data file that contains full text of code and docstring:<br /><b>{config.fullTextFile}</b>
                        </List.Item>
                        <List.Item>
                            A labeling result file, which as array of labeling applied to a list of samples, will be shown below:<br /><b>{config.labelingFile}</b>
                        </List.Item>
                    </List>
                </Container>
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

    const shouldOpenModelQueryModal = sampleExists;

    const displayOptions = useMemo(() => {
        const _CheckboxOutlineTokens =
            <Checkbox
                checked={config.outlineTokens}
                onChange={(event) => { config.outlineTokens = event.currentTarget.checked; }}
                label='Outline Tokens'
            />;

        const _CheckboxShowTeacherSamples =
            <Checkbox
                checked={config.showTeacherSamples}
                onChange={(event) => { config.showTeacherSamples = event.currentTarget.checked; }}
                label='Show Teacher Samples'
            />;
        
        const _CheckboxShowExternalLabeling =
            <Checkbox
                checked={config.showExternalLabeling}
                onChange={(event) => { config.showExternalLabeling = event.currentTarget.checked; }}
                label='Show External Labeling'
            />;

        const _Gap = <div style={{ flex: 1 }}></div>;

        const _ButtonModelQuery =
            <Button
                className='settings-button'
                variant='transparent'
                p={0}
                h={40}
                onClick={() => { shouldOpenModelQueryModal && setModelQueryModalOpened(true); }}
            >
                Model Query
                <Space w='6'></Space>
                <IconRobot></IconRobot>
            </Button>;

        const _ButtonMoreSettings =
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
            </Button>;

        return (
            <Group>
                {_CheckboxOutlineTokens} {_CheckboxShowTeacherSamples} {config.useAdvancedFeatures ? _CheckboxShowExternalLabeling : null} {_Gap} {_ButtonModelQuery} {_ButtonMoreSettings}
            </Group>
        );
    }, [config.outlineTokens, config.showTeacherSamples, config.useAdvancedFeatures, config.showExternalLabeling, shouldOpenModelQueryModal]);

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
                    <ScrollArea p='16px' h='60vh'>
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
        if (currentIndex === undefined) {
            return null;
        }

        const _ColGoToIndexButton =
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
            </Grid.Col>;
        
        const _ColNumberNavigation =
            <Grid.Col span={6.4}>
                <Center>
                    <NumberNavigation
                        value={currentLabelingResultIndex}
                        total={labelingProvider.getSampleIndices().length}
                        onChangeValue={setCurrentSampleIndex}
                        tags={labelingProvider.getSampleIndices().map((i) => i.toString())}
                    />
                </Center>
            </Grid.Col>;
        
        const _ColSaveLabelingButton =
            <Grid.Col span={2.8}>
                <Group justify='flex-end'>
                    <Button
                        onClick={() => labelingProvider.save()}     // TODO don't use labelingProvider.onSave(), it is causing cyclic calling
                    >
                        Save Labeling
                    </Button>
                </Group>
            </Grid.Col>;

        return (
            <Grid align='center' style={{ gridTemplateColumns: 'min-content 1fr min-content' }}>
                {_ColGoToIndexButton} {_ColNumberNavigation} {_ColSaveLabelingButton}
            </Grid>
        );
    }, [saveModalOpened, currentIndex, currentLabelingResultIndex, goToIndex, goToIndexError, labelingProvider, codeSamples, commentSamples, rawCodeSamples, rawCommentSamples]);  // TODO put codeSamples, commentSamples, rawCodeSamples, rawCommentSamples into one object to update

    const operationRow = useMemo(() => {
        const _ColClearAllLabelsButton =
            <Button
                onClick={() => {
                    labelingProvider.clearAllLabelsForSample(currentIndex);
                    setLabelingProvider(labelingProvider.copy());
                }}
            >
                Clear All Labels
            </Button>;
        
        const _ColResetCurrentSampleButton =
            <Button
                onClick={() => {
                    labelingProvider.resetSample(currentIndex);
                    setLabelingProvider(labelingProvider.copy());
                }}
            >
                Reset Current Sample
            </Button>;

        return (
            <Group justify='center'>
                {_ColClearAllLabelsButton} {_ColResetCurrentSampleButton}
            </Group>
        );
    }, [labelingProvider, currentIndex]);

    // TODO add transition for this
    const textLabelingArea = useMemo(() => (
        loaderOpened
            ?
            <Center h='300'>
                <Stack align='center' gap='xs'>
                    <Text c='blue'>Loading Tokens...</Text>
                    <Loader size='lg' color='blue' type='dots' />
                </Stack>
            </Center>
            :
            currentIndex
                ?
                <Container p='0'>
                    <Center>
                        <AlignmentLabels
                            labels={labels}     // TODO show number of tokens under labels, and highlight and mention those has no token
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
                    <Space h='lg'></Space>
                    {operationRow}
                </Container>
                :
                <Center h='300'>
                    <Text c='gray'>
                        No instance is loaded
                    </Text>
                </Center>
    ), [loaderOpened, currentIndex, labels, codeAreaForComment, codeAreaForCode, clickLabelCallback]);

    const getCodeSampleIndices = useMemo(() => {
        const cache = rawCodeSamples.map((s) => s.index);
        return () => cache;
    }, [rawCodeSamples]);

    const getTeacherSamples = useCallback((idx: number) => {
        return teachersProvider.getTeachers(idx);
    }, [teachersProvider]);

    const teacherSamples = useMemo(() => {
        return getTeacherSamples(currentIndex);
    }, [currentIndex, teachersProvider, getTeacherSamples]);

    const teacherSamplesDisplay = useMemo(() => {
        return teacherSamples
            ?
            teacherSamples.map(
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
                                                    {key}
                                                </Badge>
                                                <Text
                                                    size='sm'
                                                >
                                                    {tryStringifyJson(teacher[key])}
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
    }, [teacherSamples, rawCodeSamples, rawCommentSamples, labelingProvider, labels]);

    const teacherSamplesArea = (
        <>
            <Space h='xl'></Space>
            <Divider></Divider>
            <Space h='xl'></Space>
            {
                teacherSamples && teacherSamples.length > 0
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
            {(styles) => <div style={styles}>{teacherSamplesArea}</div>}
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
    }, []);

    const [moreSettingsModalOpened, setMoreSettingsModalOpened] = useState(false);
    const [activeColorIndex, setActiveColorIndex] = useState<number | null>(null);

    const [resetColorPopoverOpened, setResetColorPopoverOpened] = useState(false);
    const resetColorPopoverRef = useClickOutside(() => setResetColorPopoverOpened(false));

    const moreSettingsModal = useMemo(() => (
        <MoreSettingsModal
            opened={moreSettingsModalOpened}
            onClose={() => setMoreSettingsModalOpened(false)}
            activeColorIndex={activeColorIndex}
            setActiveColorIndex={setActiveColorIndex}
            resetColorPopoverOpened={resetColorPopoverOpened}
            setResetColorPopoverOpened={setResetColorPopoverOpened}
            resetLabelColors={resetLabelColors}
            resetColorPopoverRef={resetColorPopoverRef}
        />
    ), [config, moreSettingsModalOpened, activeColorIndex, resetColorPopoverOpened]);


    const getCodeCommentSample = useCallback((i: number) => {
        const codeSample = getValidSample(rawCodeSamples, i);
        const commentSample = getValidSample(rawCommentSamples, i);

        if (codeSample && commentSample) {
            return {
                codeTokens: getValidSample(rawCodeSamples, i)!.tokens,
                commentTokens: getValidSample(rawCommentSamples, i)!.tokens,
            };
        }

        return undefined;
    }, [rawCodeSamples, rawCommentSamples]);

    const getRefCodeCommentSamples = useCallback((i: number) => {
        const teacherSamples = getTeacherSamples(i);
        if (teacherSamples && teacherSamples.length > 0) {
            const mappedSamples = teacherSamples
                .map((s) => {
                    const refSample = {
                        codeTokens: getValidSample(rawCodeSamples, s.teacher_idx)?.tokens,
                        commentTokens: getValidSample(rawCommentSamples, s.teacher_idx)?.tokens,
                        labeling: labelingProvider.getLabelingOnSample(s.teacher_idx)
                    };
                    if (refSample.codeTokens && refSample.commentTokens && refSample.labeling) {
                        return refSample as LabeledCodeCommentSample;
                    } else {
                        return undefined;
                    }
                })
                .filter((r) => r !== undefined);

            return mappedSamples;
        } else {
            return [];
        }
    }, [teacherSamples, codeSamples, commentSamples]);

    const applyConvertedOutput = useCallback((output: string) => {
        try {
            const rawRangeLabeling = JSON.parse(output);
            const rawIndexLabeling = matchToIndices(rawRangeLabeling);
            labelingProvider.setRawIndexLabelingOnSample(currentIndex, rawIndexLabeling);
            setLabelingProvider(labelingProvider.copy());
        } catch {
            console.warn(`Cannot apply labeling due to mis-resolution: `, output);
        }
    }, [labelingProvider]);

    const [modelQueryModalOpened, setModelQueryModalOpened] = useState(false);

    const modelQueryModal = useMemo(() => (
        shouldOpenModelQueryModal &&
        <TokenAlignmentModal
            baseUrl={config.gptApiUrl}
            apiKey={config.openAiApiKey}
            opened={modelQueryModalOpened}
            targetIndex={currentIndex}
            getStudentIndices={getCodeSampleIndices}
            getTeacherIndices={() => getTeacherSamples(currentIndex)?.map((s) => s.teacher_idx) ?? []}
            getSample={getCodeCommentSample}
            getRefSamples={getRefCodeCommentSamples}   // FIXME rewrite all "teacher" samples to "ref" samples
            onClose={() => setModelQueryModalOpened(false)}
            onApplyConvertedOutput={applyConvertedOutput}
        />
    ), [config, modelQueryModalOpened, currentIndex, getCodeCommentSample, getRefCodeCommentSamples, getTeacherSamples, applyConvertedOutput]);

    return (
        <div className={className} style={{ width: '960px' }}>
            {loadingOptions}
            <Space h='sm'></Space>
            {displayOptions}
            <Space h='md'></Space>
            <Divider />
            <Space h='md'></Space>
            {navigationRow}
            <Space h='lg'></Space>
            {textLabelingArea}
            {optionalTeacherSamplesArea}

            {saveLabelingModal}
            {moreSettingsModal}
            {modelQueryModal}
        </div>
    );
}

function MoreSettingsModal({
    opened,
    onClose,
    activeColorIndex,
    setActiveColorIndex,
    resetColorPopoverOpened,
    setResetColorPopoverOpened,
    resetLabelColors,
    resetColorPopoverRef
}: {
    opened: boolean;
    onClose: () => void;
    activeColorIndex: number | null;
    setActiveColorIndex: (index: number | null) => void;
    resetColorPopoverOpened: boolean;
    setResetColorPopoverOpened: (opened: boolean) => void;
    resetLabelColors: () => void;
    resetColorPopoverRef: React.RefObject<HTMLDivElement>;
}) {
    const config = useSmartConfig(globalMakerConfigSchema, globalMakerConfigSettersContext);
    
    const _GroupStyle =
        <Container p={0} w='100%'>
            <Title order={4} p='0 0 0.2em 0'>Style</Title>
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
                            <IconReload style={{ width: rem(12), height: rem(12) }} />
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
        </Container>;
    
    const _GroupFileNames =
        <Container p={0} w='100%'>
            <Title order={4} p='0.2em 0'>File Names</Title>
            <TextInput
                label="Full Text File"
                placeholder="file that contains full text of code and comments"
                value={config.fullTextFile}
                onChange={(e) => { config.fullTextFile = e.target.value; }}
                onFocus={(e) => { e.target.select(); }}
            />
            <Group p={0} grow justify='space-between'>
                <TextInput
                    label="Code Tokens File"
                    placeholder="file with code tokens"
                    value={config.completeCodeTokensFile}
                    onChange={(e) => { config.completeCodeTokensFile = e.target.value; }}
                    onFocus={(e) => { e.target.select(); }}
                />
                <TextInput
                    label="Comment Tokens File"
                    placeholder="file with comment tokens"
                    value={config.completeCommentTokensFile}
                    onChange={(e) => { config.completeCommentTokensFile = e.target.value; }}
                    onFocus={(e) => { e.target.select(); }}
                />
            </Group>
            <Group p={0} grow justify='space-between'>
                <TextInput
                    label="Labeling File"
                    placeholder="file with concrete labeling"
                    value={config.labelingFile}
                    onChange={(e) => { config.labelingFile = e.target.value; }}
                    onFocus={(e) => { e.target.select(); }}
                />
                <TextInput
                    label="Teachers File"
                    placeholder="file with teachers information"
                    value={config.teacherFile}
                    onChange={(e) => { config.teacherFile = e.target.value; }}
                    onFocus={(e) => { e.target.select(); }}
                />
            </Group>
            <TextInput
                label="External Highlight File"
                placeholder="file with external highlighting information"
                value={config.highlightFile}
                onChange={(e) => { config.highlightFile = e.target.value; }}
                onFocus={(e) => { e.target.select(); }}
            />
        </Container>;
    
    const _GroupOpenAISettings =
        <Container p={0} w='100%'>
            <Title order={4} p='0.2em 0'>OpenAI Settings</Title>
            <TextInput
                label="Model API URL"
                placeholder="address of OpenAI model API"
                value={config.gptApiUrl}
                onChange={(e) => { config.gptApiUrl = e.target.value; }}
                onFocus={(e) => { e.target.select(); }}
            />
            <TextInput
                label="OpenAI API Key"
                placeholder="a valid API key"
                value={config.openAiApiKey}
                onChange={(e) => { config.openAiApiKey = e.target.value; }}
                onFocus={(e) => { e.target.select(); }}
            />
        </Container>;
    
    const _GroupAdvancedSettings =
        <Container p={0} w='100%'>
            <Title order={4} p='0.2em 0'>Advanced Settings</Title>
            <Checkbox
                p='3px 0'
                checked={config.useAdvancedFeatures}
                onChange={(event) => { config.useAdvancedFeatures = event.currentTarget.checked; }}
                label='Enable Advanced Features'
            />
            <Checkbox
                p='3px 0'
                disabled={!config.useAdvancedFeatures}
                checked={config.showExternalLabelingScore}
                onChange={(event) => { config.showExternalLabelingScore = event.currentTarget.checked; }}
                label='External Labeling: Show Score'
            />
            <Checkbox
                p='3px 0'
                disabled={!config.useAdvancedFeatures}
                checked={config.showExternalLabelingScoreInPercentage}
                onChange={(event) => { config.showExternalLabelingScoreInPercentage = event.currentTarget.checked; }}
                label='External Labeling: Show Score In Percentage'
            />
        </Container>;
    
    return (
        <Modal
            opened={opened}
            onClose={() => {
                onClose();
                setActiveColorIndex(null);
            }}
            title="More Settings"
            size='lg'
        >
            <Stack p='0 0 1em'>
                {_GroupStyle}
                {_GroupFileNames}
                {_GroupOpenAISettings}
                {_GroupAdvancedSettings}
            </Stack >
        </Modal >
    );
}


