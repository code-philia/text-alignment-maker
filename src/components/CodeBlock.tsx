import { ScrollArea } from '@mantine/core';
import { useRef, useEffect } from 'react';
import { removeDocstrings, isSpecialToken, findCommentEnd } from '../utils';
import { globalMakerConfigSchema, globalMakerConfigSettersContext, simpleMantineStandardColors, useSmartConfig } from '../config';

// code block
function generateHighlightedCode(
    codeElement: HTMLElement,
    originalText: string,
    tokens: string[],
    groupedTokenIndices: number[][],
    highlightedTokenIndices: number[][]
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

    const tokenToHighlight: Map<number, number> = new Map();
    highlightedTokenIndices.forEach((group, groupIndex) => {
        group.forEach((index) => {
            tokenToHighlight.set(index, groupIndex);
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

            span.classList.add(`token-${tokenIndex}`);

            const labelNumber = tokenToLabel.get(tokenIndex);
            if (labelNumber !== undefined) {
                span.classList.add(`label-${labelNumber}`);
            }

            const highlightNumber = tokenToHighlight.get(tokenIndex);
            if (highlightNumber !== undefined) {
                span.classList.add(`highlight-${highlightNumber}`);
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
        if (range.toString().length <= 0) {
            continue;
        }

        const startContainer = range.startContainer;
        const endContainer = range.endContainer;

        const startSpan = targetNodes.find((span) => span.contains(startContainer));
        const endSpan = targetNodes.find((span) => span.contains(endContainer));

        if (!(startSpan || endSpan)) return;

        const _startIndex = (startSpan && targetNodes.indexOf(startSpan)) ?? 0;
        const startIndex = _startIndex < 0 ? 0 : _startIndex; // If startSpan is not found? Will that happen?

        const _endIndex = (endSpan && targetNodes.indexOf(endSpan)) ?? targetNodes.length - 1;
        const endIndex = _endIndex < 0 ? targetNodes.length - 1 : _endIndex; // If endSpan is not found? Will that happen?

        selectedElements.push(...targetNodes.slice(startIndex, endIndex + 1));
    }

    return selectedElements;
}
function expandSelectedRanges(selection: Selection, targetSpans: HTMLElement[]) {
    for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        if (range.toString().length <= 0) {
            continue;
        }

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
const highlightPrefix = 'highlight-';

function getFollowingNumber(cls: string, prefix: string) {
    if (cls.startsWith(prefix)) {
        const labelNumber = parseInt(cls.slice(prefix.length));
        if (!isNaN(labelNumber)) {
            return labelNumber;
        }
    }
    return undefined;
}
;
function getNumberOfElement(element: HTMLElement, prefix: string) {
    for (const cls of element.classList) {
        const labelNumber = getFollowingNumber(cls, prefix);
        if (labelNumber !== undefined) {
            return labelNumber;
        }
    }
    return undefined;
}

function restoreSelection(code: HTMLElement, selected: number[]) {
    const selectedSet = new Set(selected);
    const allSpans = code.querySelectorAll('span');

    allSpans.forEach((span, i) => {
        if (selectedSet.has(i)) {
            span.classList.add('selected');
        } else {
            span.classList.remove('selected');
        }
    });
}

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

// function resolveColor(colorLiteral: string) {
//     if (colorLiteral in simpleMantineStandardColors) {
//         return `var(--mantine-color-${colorLiteral}-filled)`;
//     }

//     return colorLiteral;
// };

function processTokens(code: HTMLElement, groupColors: string[], highlightColors: string[]) {
    const targetSpans: HTMLElement[] = [];

    code.childNodes.forEach((node) => {
        if (node instanceof HTMLSpanElement) {
            targetSpans.push(node);
        }
    });

    targetSpans.forEach((span) => {
        const labelNumber = getNumberOfElement(span, labelPrefix);
        if (labelNumber !== undefined) {
            span.style.color = groupColors[labelNumber];
        }

        const highlightNumber = getNumberOfElement(span, highlightPrefix);
        if (highlightNumber !== undefined && highlightColors[highlightNumber]) {
            span.style.outline = `1px solid ${highlightColors[highlightNumber]}`;
        }
    });
}
type CodeBlockProps = {
    code: string;
    tokens: string[];
    groupedTokenIndices: number[][];
    highlightedTokenIndices?: number[][];
    highlightedTokenScores?: number[][];
    groupColors: string[];
    selected: number[];
    onTokenSelectionChange?: (selectedTokenIndices: number[]) => void;
};

export function CodeBlock({ code, tokens, groupedTokenIndices, highlightedTokenIndices, highlightedTokenScores, groupColors, selected, onTokenSelectionChange }: CodeBlockProps) {
    const config = useSmartConfig(globalMakerConfigSchema, globalMakerConfigSettersContext);;

    const codeRef = useRef<HTMLPreElement>(null);

    useEffect(() => {
        if (codeRef.current) {
            generateHighlightedCode(codeRef.current, code, tokens, groupedTokenIndices, config.showExternalLabeling ? (highlightedTokenIndices ?? []) : []);
            processTokens(codeRef.current, groupColors, config.showExternalLabeling && highlightedTokenIndices ? new Array(highlightedTokenIndices.length).fill('#0000ff') : []);
            restoreSelection(codeRef.current, selected);    // FIXME this is not restoring actual selection. either don't rerender or manually set actual selection range
            return processSelectionEvents(codeRef.current, onTokenSelectionChange);
        }
    }, [code, groupColors, groupedTokenIndices, onTokenSelectionChange, tokens, config.showExternalLabeling]);

    return (
        <pre className='target-code-pre'>
            <ScrollArea h={300}>
                <div style={{ padding: '1em' }}>
                    <code ref={codeRef}>
                        {code}
                    </code>
                </div>
                {config.showExternalLabeling && config.showExternalLabelingScore && highlightedTokenIndices && highlightedTokenScores && (
                    <div style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
                        {Array.from(codeRef.current?.querySelectorAll('span') ?? []).map((span, index) => {
                            const targetCodePre = span.closest('.target-code-pre');
                            const rect = span.getBoundingClientRect();
                            const preRect = targetCodePre?.getBoundingClientRect();
                            if (!preRect) return null;
                            const relativeRect = {
                                left: rect.left - preRect.left,
                                top: rect.top - preRect.top
                            };
                            const tokenIndex = getFollowingNumber(span.classList[0], tokenIndexPrefix);
                            if (tokenIndex === undefined) return null;

                            let score: number | undefined;
                            highlightedTokenScores.forEach((scores, groupIndex) => {
                                const index = highlightedTokenIndices[groupIndex].indexOf(tokenIndex);
                                if (index !== -1) {
                                    score = scores[index];
                                }
                            });

                            if (score === undefined) return null;

                            return (
                                <div key={index} className='labeling-score' style={{
                                    position: 'absolute',
                                    left: `${relativeRect.left}px`,
                                    top: `${relativeRect.top - 16}px`,
                                    fontSize: '8px',
                                    width: 'max-content',
                                    color: '#0000ff'
                                }}>
                                    {config.showExternalLabelingScoreInPercentage ? (score * 100).toFixed(2) : score.toFixed(2)}
                                </div>
                            );
                        })}
                    </div>
                )}
            </ScrollArea>

        </pre>
    );
}
