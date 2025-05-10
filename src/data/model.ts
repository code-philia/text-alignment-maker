import OpenAI from 'openai';
import { isSpecialToken } from '../utils';

interface TokenPair {
    commentTokens: string[];
    codeTokens: string[];
}

interface Alignment {
    commentToken: string[];
    codeToken: string[];
}

interface AlignmentResponse {
    alignments: Alignment[];
}

interface StreamCallbacks {
    onData?: (chunk: string) => void;
    onError?: (error: Error) => void;
    onFinish?: (finalResponse: AlignmentResponse) => void;
}

export class TokenAlignmentService {
    private client: OpenAI;
    private systemPrompt = `You are an expert at aligning tokens between comments and code. You can accurately identify the similarities and differences between tokens, and you are highly skilled at matching tokens based on their semantics and functionality. You are given input data consisting of comment tokens and code tokens, and your task is to align them by identifying concepts in the comments and matching them to corresponding code tokens. Use the example cases below and output your results in the specified format.`;

    constructor(apiKey: string, baseUrl?: string) {
        this.client = new OpenAI({
            apiKey,
            baseURL: baseUrl,
            dangerouslyAllowBrowser: true
        });
    }

    private constructTeacherPrompt(teacherTokens: TokenPair, alignments: Alignment[]): string {
        return `
Below is an example that demonstrates how to align comment tokens and code tokens:
**Teacher Example:**
Comment Tokens Index and Comment Tokens String:
${JSON.stringify(teacherTokens.commentTokens)}
Code Tokens Index and Code Tokens String:
${JSON.stringify(teacherTokens.codeTokens)}
**Matching Output:**
${JSON.stringify(alignments)}
`;
    }

    

    private constructStudentPrompt(studentTokens: TokenPair): string {
        const alignmentFormat = `
{
    "alignments": [
    {"comment_token": ["token1", "token2"], "code_token": ["tokenA", "tokenB"]},
    {"comment_token": ["token3", "token4"], "code_token": ["tokenC", "tokenD"]},
    {"comment_token": ["token5", "token6"], "code_token": ["tokenE", "tokenF"]}
    ]
}`;

    return `
CRITICAL ALIGNMENT INSTRUCTIONS:
1. FIRST analyze comment semantics:
    - Break into distinct concepts
    - Keep concepts separate
    - No combining unrelated ideas
2. THEN find ALL functional matches:
    - API calls & methods
    - Parameters & returns 
    - Library features
    - Variables & data structures
    - Control flow
    - Only then consider naming
3. Get complete functional units
4. One concept per code token
5. Use exact indices
6. Focus on implementation details
7. MAXIMIZE code token coverage:
    - Try to match every code token possible
    - Only leave tokens unmatched if no semantic connection exists
    - Check all code tokens multiple times to ensure maximum matches

Here are the tokens to align:
Comment Tokens Index and Comment Tokens String:
${JSON.stringify(studentTokens.commentTokens)}
Code Tokens Index and Code Tokens String:
${JSON.stringify(studentTokens.codeTokens)}

Based on the above instructions and following the teacher example, provide comprehensive alignments between comment concepts and code implementations. Output in this format:
${alignmentFormat}
`;
    }

    async generateAlignment(
        studentTokens: TokenPair,
        teacherTokens?: TokenPair,
        teacherAlignments?: Alignment[],
        callbacks?: StreamCallbacks
    ): Promise<AlignmentResponse | undefined> {
        const prompt = this.systemPrompt +
            ((teacherTokens && teacherAlignments) ? this.constructTeacherPrompt(teacherTokens, teacherAlignments) : '') +
            this.constructStudentPrompt(studentTokens);

        try {
            const stream = await this.client.chat.completions.create({
                model: "gpt-4o-2024-08-06",
                messages: [{ role: "user", content: prompt }],
                stream: true,
                response_format: {
                    type: "json_schema",
                    json_schema: {
                        "strict": true,
                        "name": "alignment_response",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "alignments": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "commentToken": {
                                                "type": "array",
                                                "items": {"type": "string"}
                                            },
                                            "codeToken": {
                                                "type": "array", 
                                                "items": {"type": "string"}
                                            }
                                        },
                                        "required": ["commentToken", "codeToken"],
                                        "additionalProperties": false
                                    }
                                }
                            },
                            "required": ["alignments"],
                            "additionalProperties": false
                        }
                    }
                }
            });

            let fullResponse = '';

            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                fullResponse += content;

                if (callbacks?.onData) {
                    callbacks.onData(content);
                }
            }

            const jsonMatch = fullResponse.match(/\{.*\}/s);
            if (!jsonMatch) {
                throw new Error("No valid JSON found in response");
            }

            const response: AlignmentResponse = JSON.parse(jsonMatch[0]);

            if (callbacks?.onFinish) {
                callbacks.onFinish(response);
            }

            return response;

        } catch (error) {
            if (callbacks?.onError) {
                callbacks.onError(error as Error);
            } else {
                throw error;
            }
        }
    }
}

export function toUniqueSymbols(nlpTokens: string[], isComment: boolean = true): [string[], Map<string, number>] {
    const tokens = nlpTokens
        .filter((token) => !isSpecialToken(token))
        .map((token) => token.replace('\u0120', ''));

    const tokenCounts: { [key: string]: number } = {};
    const processedTokens: string[] = [];
    
    for (const token of tokens) {
        if (token in tokenCounts) {
            tokenCounts[token]++;
        } else {
            tokenCounts[token] = 1;
        }
    }
    
    const mapToOriginalIndex = new Map<string, number>();

    const tokenSeen: { [key: string]: number } = {};
    tokens.forEach((token, i) => {
        let symboledToken;

        if (tokenCounts[token] > 1) {
            // Track occurrence number for this token
            if (!(token in tokenSeen)) {
                tokenSeen[token] = 1;
            } else {
                tokenSeen[token]++;
            }
            
            // Add triangle (▲) for comments, square (■) for code
            const symbol = isComment ? "▲" : "■";
            symboledToken = `${token}${symbol}${tokenSeen[token]}`;
        } else {
            symboledToken = token;
        }

        processedTokens.push(symboledToken);
        mapToOriginalIndex.set(symboledToken, i);
    });
    
    return [processedTokens, mapToOriginalIndex];
}

export function toAlignmentWithUniqueToken(uniqueCodeTokens: string[], uniqueCommentTokens: string[], sampleLabelIndices: number[][][]): Alignment[] {
    const result = sampleLabelIndices.map((singleLabelIndices) => {
        const [commentIndices, codeIndices] = singleLabelIndices;
        return {
            commentToken: commentIndices.map((i) => uniqueCommentTokens[i]),
            codeToken: codeIndices.map((i) => uniqueCodeTokens[i])
        };
    });
    return result;
}

export function toAlignmentWithIndices(alignments: Alignment[], mapsToOriginalIndex: Map<string, number>[]): (number | undefined)[][][] {
    const [commentMap, codeMap] = mapsToOriginalIndex;

    const result = alignments.map((singleLabelAlignment) => {
        const codeTokens = singleLabelAlignment.codeToken;
        const commentTokens = singleLabelAlignment.commentToken;

        // NOTE this is skipping unmatched symboled tokens from output
        return [
            commentTokens.map((token) => commentMap.get(token)).filter(i => i !== undefined),
            codeTokens.map((token) => codeMap.get(token)).filter(i => i !== undefined)
        ];
    });

    return result;
}
