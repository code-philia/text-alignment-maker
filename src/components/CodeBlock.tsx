import { ScrollArea } from '@mantine/core';
import { useRef, useEffect } from 'react';
import { removeDocstrings, isSpecialToken, findCommentEnd } from '../utils';
import { undefined } from './feature';

// code block
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
;
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
        if (node instanceof HTMLSpanElement) {
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
export function CodeBlock({ code, tokens, groupedTokenIndices, groupColors, onTokenSelectionChange }: CodeBlockProps) {
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
