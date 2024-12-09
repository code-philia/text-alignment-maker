import { Carousel } from '@mantine/carousel';
import { Button, Flex, rem, ScrollArea, Space, TextInput, Group, Checkbox } from '@mantine/core';
import { IconArrowRight, IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import hljs from 'highlight.js';
import 'highlight.js/styles/atom-one-light.min.css';

// const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.';

function mouseEventLiesIn(e: MouseEvent, ...targetSpans: HTMLElement[]) {
    return e.target instanceof Node
        && targetSpans.some((span) => span.contains(e.target as Node));
}

function getSelectedElements(selection: Selection, targetSpans: HTMLElement[]) {
    const selectedElements: HTMLElement[] = [];

    for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i);
        const startContainer = range.startContainer;
        const endContainer = range.endContainer;

        const startSpan = targetSpans.find((span) => span.contains(startContainer));
        const endSpan = targetSpans.find((span) => span.contains(endContainer));
        if (startSpan && endSpan) {
            const _startIndex = targetSpans.indexOf(startSpan);
            const startIndex = _startIndex < 0 ? 0 : _startIndex;
            const endIndex = targetSpans.indexOf(endSpan);

            selectedElements.push(...targetSpans.slice(startIndex, endIndex + 1));  // even if endIndex === -1 this works
        }
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

function processCode(code: HTMLElement) {
    if (code.hasAttribute('data-highlighted')) return;

    console.log(`highlighting ${code.outerHTML}`);
    hljs.highlightElement(code);

    const targetSpans: HTMLElement[] = [];

    code.childNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) {
            const span = document.createElement('span');
            span.textContent = node.textContent;
            code.replaceChild(span, node);

            targetSpans.push(span);
        } else {
            targetSpans.push(node);
        }
    });

    // let selecting = false;

    // TODO 应该是这样：点击后 → 计算 selected range → selected range 直接指向触发的那个 span → 那个 span 选中一次

    // window.addEventListener('mousedown', (e: MouseEvent) => {
    //     if (!(e.target instanceof Node && codeWrapper.contains(e.target))){
    //         console.log(`focus out! the target is`, e.target, codeWrapper);
    //         targetSpans.forEach((span) => {
    //             span.classList.remove('selected');
    //         });
    //     } else {
    //         console.log(`focus in! the target is`, e.target, codeWrapper);
    //     }
    // });
    // codeWrapper.addEventListener('mousedown', (e) => {
    //     targetSpans.forEach((span) => {
    //         span.classList.remove('selected');
    //     });
    //     if (e.target instanceof HTMLElement) {
    //         selecting = true;
    //     }
    // });
    // codeWrapper.addEventListener('mouseup', () => {
    //     selecting = false;
    // });
    // targetSpans.forEach((span) => {
    //     span.addEventListener('mouseover', () => {
    //         // console.log(`mouse over on ${span.textContent}`);
    //         if (selecting) {
    //             span.classList.add('selected');
    //         }
    //     });
    // });

    let manualSelectionChange = false;

    document.addEventListener('selectionchange', () => {
        if (manualSelectionChange) {
            manualSelectionChange = false;
            return;
        }

        const selection = window.getSelection();
        if (focused && selection && selection.rangeCount > 0) {
            const selectedElements = new Set(getSelectedElements(selection, targetSpans));
            targetSpans.forEach((span) => {
                if (selectedElements.has(span)) {
                    span.classList.add('selected');
                } else {
                    span.classList.remove('selected');
                }
            });
        } else {
            targetSpans.forEach((span) => {
                span.classList.remove('selected');
            });
        }
    });

    let focused = false;

    window.addEventListener('mousedown', (e: MouseEvent) => {
        if (!mouseEventLiesIn(e, ...targetSpans)) {
            focused = false;
            targetSpans.forEach((span) => {
                span.classList.remove('selected');
            });
        }
    });

    // detail: all the range of the covered spans are selected
    window.addEventListener('mouseup', () => {
        const selection = window.getSelection();
        if (focused && selection && selection.rangeCount > 0) {
            expandSelectedRanges(selection, targetSpans);
            manualSelectionChange = true;
        }
    });

    targetSpans.forEach((span) => {
        span.addEventListener('mousedown', () => {
            focused = true;
        });
    });
}

type CodeBlockProps = {
    code: string;
};

export function CodeBlock({ code }: CodeBlockProps) {
    const codeRef = useRef<HTMLPreElement>(null);

    useEffect(() => {
        if (codeRef.current) {
            processCode(codeRef.current);
        }
    }, [code]);

    return (
        <pre className='target-code-pre'>
            <code ref={codeRef}>
                {code}
            </code>
        </pre>
    );
}

export function Feature() {
    const codeCarouselRef = useRef<HTMLDivElement>(null);

    const [optionOutlineTokens, setOptionOutlineTokens] = useState(false);

    const samples = [
        'The Python \nLanguage',
        // lorem
    ];
    const slides = samples.map((sample, i) =>
        <Carousel.Slide key={i}>
            <ScrollArea w='80%' style={{ margin: '0 auto' }}>
                <CodeBlock code={sample} />
            </ScrollArea>
        </Carousel.Slide>
    );

    const classList = ['feature-block'];
    if (optionOutlineTokens) {
        classList.push('outline-tokens');
    }

    const className = classList.join(' ');

    return (
        <div className={className} style={{ width: '500px' }}>
            <TextInput label='Tokens directory' description='Directory that contains tokens of samples' />
            <Flex align='flex-end'>
                <TextInput label='Results file' description='Labeling results file (.jsonl) of samples' style={{ flexGrow: '1' }} />
                <Space w='sm'></Space>
                <Button>Load</Button>
            </Flex>
            <Space h='sm'></Space>
            <Group>
                <Checkbox
                    checked={optionOutlineTokens}
                    onChange={(event) => setOptionOutlineTokens(event.currentTarget.checked)}
                    label='Outline Tokens' />
            </Group>
            <Carousel
                ref={codeCarouselRef}
                nextControlIcon={<IconArrowRight style={{ width: rem(16), height: rem(16) }} />}
                previousControlIcon={<IconArrowLeft style={{ width: rem(16), height: rem(16) }} />}
                slideGap='sm'
                controlsOffset='xs'
                draggable={false}
                speed={10000}
            >
                {slides}
            </Carousel>
    </div>
  );
}
