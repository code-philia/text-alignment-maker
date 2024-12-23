import { useState } from 'react';
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
    Container
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { toAlignmentWithIndices, toAlignmentWithUniqueToken, TokenAlignmentService, toUniqueSymbols } from '../data/model';
import { indicesToMatch } from '../utils';

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

    sample: CodeCommentSample;
    refSamples: LabeledCodeCommentSample[];     // NOTE only use the first sample, currently
}

export function TokenAlignmentModal({ apiKey, baseUrl, sample, refSamples, opened, onClose, onApplyConvertedOutput }: TokenAlignmentModalProps) {
    const [studentIndex, setStudentIndex] = useState<number | ''>(0);
    const [teacherIndex, setTeacherIndex] = useState<number | ''>(0);
    const [loading, setLoading] = useState(false);
    const [output, setOutput] = useState<string>('');
    const [convertedOutput, setConvertedOutput] = useState<string>('');
    const [streamingOutput, setStreamingOutput] = useState<string>('');

    const handleSubmit = async () => {
        if (studentIndex === '' || teacherIndex === '') {
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

            const [uniqueStudentCodeTokens, mapOfUniqueStudentCodeTokens] = toUniqueSymbols(sample.codeTokens);
            const [uniqueStudentCommentTokens, mapOfUniqueStudentCommentTokens] = toUniqueSymbols(sample.commentTokens);
            
            const studentTokens = {
                codeTokens: uniqueStudentCodeTokens,
                commentTokens: uniqueStudentCommentTokens
            }
            
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
                    {/* <NumberInput
                        label="Student Sample Index"
                        placeholder="Enter student index"
                        value={studentIndex}
                        onChange={(v) => (typeof v === 'number' && setStudentIndex(v))}
                        min={0}
                    />

                    <NumberInput
                        label="Teacher Sample Index"
                        placeholder="Enter teacher index"
                        value={teacherIndex}
                        onChange={(v) => (typeof v === 'number' && setTeacherIndex(v))}
                        min={0}
                    /> */}

                    <Button onClick={handleSubmit} loading={loading}>
                        Generate Alignment
                    </Button>

                    {streamingOutput && (
                        <Container p='0'>
                            <Text size="sm" fw={500}>Streaming Response:</Text>
                            <Code block style={{ textWrap: 'wrap' }}>{streamingOutput}</Code>
                        </Container>
                    )}

                    <Group p='0' gap='md' justify='center' align='flex-start'>
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
                                </Button>
                            </Stack>
                        )}
                    </Group>
                </Stack>
            </ScrollAreaAutosize>
        </Modal>
    );
}