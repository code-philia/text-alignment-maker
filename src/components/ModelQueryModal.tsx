import { useEffect, useRef, useState } from 'react';
import {
    Modal,
    Button,
    TextInput,
    NumberInput,
    Stack,
    Text,
    Code,
    Paper,
    LoadingOverlay,
    Space,
    ScrollArea,
    ScrollAreaAutosize,
    Group,
    Container,
    Select
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { toAlignmentWithIndices, toAlignmentWithUniqueToken, TokenAlignmentService, toUniqueSymbols } from '../data/model';
import { indicesToMatch } from '../utils';
import { IconCheck, IconRobot } from '@tabler/icons-react';

export interface CodeCommentSample {
    commentTokens: string[];
    codeTokens: string[];
}

export interface LabeledCodeCommentSample {
    commentTokens: string[];
    codeTokens: string[];
    labeling: number[][][];
}

export interface TokenAlignmentModalProps {
    apiKey: string;
    baseUrl: string;
    opened: boolean;
    onClose: () => void;
    
    onApplyConvertedOutput?: (output: string) => void;
    
    getStudentIndices: () => number[];
    getTeacherIndices: (i: number) => number[];
    
    getSample: (i: number) => CodeCommentSample | undefined;
    getRefSamples: (i: number) => LabeledCodeCommentSample[];     // NOTE only use the first sample, currently

    targetIndex: number;
}

export function TokenAlignmentModal({
    apiKey, baseUrl, opened, onClose, onApplyConvertedOutput ,
    getStudentIndices, getTeacherIndices, getSample, getRefSamples, targetIndex
}: TokenAlignmentModalProps) {
    const [studentIndex, setStudentIndex] = useState<number | null>(null);
    const [teacherIndex, setTeacherIndex] = useState<number | null>(null);
    const [teacherIndices, setTeacherIndices] = useState<string[]>([]);

    const [loading, setLoading] = useState(false);
    const [output, setOutput] = useState<string>('');
    const [convertedOutput, setConvertedOutput] = useState<string>('');
    const [streamingOutput, setStreamingOutput] = useState<string>('');

    useEffect(() => {
        if (targetIndex !== null) {
            setStudentIndex(targetIndex);
        }
    }, [targetIndex]);

    const handleSubmit = async () => {
        if (studentIndex === null || teacherIndex === null) {
            notifications.show({
                title: 'Error',
                message: 'Please enter both indices',
                color: 'red'
            });
            return;
        }

        setLoading(true);
        setOutput('');
        setConvertedOutput('');
        setStreamingOutput('');

        try {
            const service = new TokenAlignmentService(
                apiKey,
                baseUrl,
            );

            // Mock data - replace with your actual data fetching logic
            // const studentTokens = {
            //     commentTokens: ["parse", "input", "string"],
            //     codeTokens: ["str", "parse", "input"]
            // };

            // const teacherTokens = {
            //     commentTokens: ["parse", "input", "data"],
            //     codeTokens: ["str", "parse", "data"]
            // };

            // const teacherAlignments = [
            //     {
            //         commentToken: ["parse", "input"],
            //         codeToken: ["parse", "str"]
            //     }
            // ];

            const sample = getSample(studentIndex);
            if (sample === undefined) return;

            const [uniqueStudentCodeTokens, mapOfUniqueStudentCodeTokens] = toUniqueSymbols(sample.codeTokens);
            const [uniqueStudentCommentTokens, mapOfUniqueStudentCommentTokens] = toUniqueSymbols(sample.commentTokens);
            
            const studentTokens = {
                codeTokens: uniqueStudentCodeTokens,
                commentTokens: uniqueStudentCommentTokens
            }
            
            const refSamples = getRefSamples(studentIndex);

            let teacherTokens, teacherAlignments;
            if (refSamples[0]) {
                const [uniqueTeacherCodeTokens, mapOfUniqueTeacherCodeTokens] = toUniqueSymbols(refSamples[0].codeTokens);
                const [uniqueTeacherCommentTokens, mapOfUniqueTeacherCommentTokens] = toUniqueSymbols(refSamples[0].commentTokens);
                
                teacherTokens = {
                    codeTokens: uniqueTeacherCodeTokens,
                    commentTokens: uniqueTeacherCommentTokens
                };
    
                teacherAlignments = toAlignmentWithUniqueToken(
                    teacherTokens.codeTokens,
                    teacherTokens.commentTokens,
                    refSamples[0].labeling
                )

                if (refSamples[0].labeling.length === 0) {
                    notifications.show({
                        title: 'Warning',
                        message: 'The teacher has an empty alignment',
                        color: 'yellow'
                    });
                }
            }

            const result = await service.generateAlignment(
                studentTokens,
                teacherTokens,
                teacherAlignments,
                {
                    onData: (chunk) => {
                        setStreamingOutput(prev => prev + chunk);
                    },
                    onFinish: (response) => {
                        setOutput(JSON.stringify(response, null, 2));
                        setStreamingOutput('');

                        const convertedResult = toAlignmentWithIndices(
                            response.alignments,
                            [mapOfUniqueStudentCommentTokens, mapOfUniqueStudentCodeTokens]
                        );

                        if (convertedResult.every(
                            l => l.every(
                                g => g.every(
                                    n => n !== undefined
                        )))) {
                            const converted = JSON.stringify(indicesToMatch(convertedResult));
                            
                            setConvertedOutput(converted);
                        }
                    },
                    onError: (error) => {
                        notifications.show({
                            title: 'Error',
                            message: error.message,
                            color: 'red'
                        });
                    }
                }
            );

        } catch (error) {
            notifications.show({
                title: 'Error',
                message: error instanceof Error ? error.message : 'An error occurred',
                color: 'red'
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const teacherIndices = studentIndex ? getTeacherIndices(studentIndex).map(i => `${i}`) : [];
        setTeacherIndices(teacherIndices);

        const initTeacherIndex = teacherIndices.length > 0 ? teacherIndices[0] : null;
        setTeacherIndex(initTeacherIndex ? parseInt(initTeacherIndex) : null);
    }, [getTeacherIndices])

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title="Token Alignment Generator"
            style={{ overflow: 'hidden' }}
            size='lg'
            mah='60vh'
        >
            <ScrollAreaAutosize p='0 1em'>
                <Stack gap="md" p='0 0 0.5em' w='100%'>
                    {/* <Select
                        label="Student Sample Index"
                        placeholder="Enter student index"
                        value={studentIndex ? `${studentIndex}` : null}
                        data={getStudentIndices().map(i => `${i}`)}
                        onChange={(v) => {
                            if (v === null) return;

                            const i = parseInt(v);
                            if (!Number.isNaN(i)) {
                                setStudentIndex(i);
                            }
                        }}
                        min={0}
                    /> */}

                    <Select
                        allowDeselect={false}
                        label="Teacher Sample Index"
                        placeholder="Enter teacher index"
                        data={teacherIndices}
                        value={`${teacherIndex}`}
                        onChange={(v) => {
                            if (v === null) return;

                            const i = parseInt(v);
                            if (!Number.isNaN(i)) {
                                setTeacherIndex(i);
                            }
                        }}
                        min={0}
                    />

                    <Button onClick={handleSubmit} loading={loading}>
                        Generate Alignment
                        <Space w='0.5em'/>
                        <IconRobot></IconRobot>
                    </Button>

                    {streamingOutput && (
                        <Container p='0'>
                            <Text size="sm" fw={500}>Streaming Response:</Text>
                            <Code block style={{ textWrap: 'wrap' }}>{streamingOutput}</Code>
                        </Container>
                    )}

                    <Group p='0' gap='lg' justify='center' align='flex-start'>
                        {output && (
                            <Container flex='1' p='0'>
                                <Text size="sm" fw={500}>Final Response:</Text>
                                <Code block style={{ textWrap: 'wrap' }}>
                                    <ScrollArea.Autosize mah='50vh'>
                                        {output}
                                    </ScrollArea.Autosize>
                                </Code>
                            </Container>
                        )}

                        {convertedOutput && (
                            <Stack flex='1' p='0'>
                                <Container p='0'>
                                    <Text size="sm" fw={500}>Converted Final Response:</Text>
                                    <Code block style={{ textWrap: 'wrap', wordWrap: 'break-word' }}>
                                        <ScrollArea.Autosize mah='50vh'>
                                            {convertedOutput}
                                        </ScrollArea.Autosize>
                                    </Code>
                                </Container>
                                <Button
                                        onClick={() => {
                                            onApplyConvertedOutput?.(convertedOutput);
                                            onClose();
                                        }}
                                    >
                                    Apply
                                    <Space w='0.3em'/>
                                    <IconCheck />
                                </Button>
                            </Stack>
                        )}
                    </Group>
                </Stack>
            </ScrollAreaAutosize>
        </Modal>
    );
}