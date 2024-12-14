import { Group, Button } from "@mantine/core";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";

export type NumberNavigationProps = {
    value: number;
    total: number;
    onChangeValue: (i: number) => void;
    tags?: string[];
}

export function NumberNavigation({ value, total, onChangeValue, tags }: NumberNavigationProps) {
    const numOfOptions = 8;

    const page = Math.floor(value / numOfOptions);
    const totalPages = Math.ceil(total / numOfOptions);

    const startIndex = page * numOfOptions;
    const endIndex = Math.min(startIndex + numOfOptions, total);

    const isFirstPage = page == 0;
    const isLastPage = page >= totalPages - 1;

    const isSelected = (i: number) => value % numOfOptions === i;

    const prevPageValue = Math.max(value - numOfOptions, 0);
    const nextPageValue = Math.min(value + numOfOptions, total - 1);

    return (
        <Group gap='3'>
            <Button
                className='number-navigation-button'
                variant='transparent'
                color='gray'
                disabled={isFirstPage}
                onClick={() => onChangeValue(prevPageValue)}
            >
                <IconArrowLeft />
            </Button>
            {new Array(endIndex - startIndex).fill(0).map((_, i) => (
                <Button
                    key={i + 1}
                    className='number-navigation-button'
                    variant={ isSelected(i) ? 'filled' : 'transparent' }
                    color={ isSelected(i) ? 'blue' : 'gray' }
                    onClick={() => onChangeValue(startIndex + i)}
                >
                    {tags ? tags[startIndex + i] : (startIndex + i + 1)}
                </Button>
            ))}
            <Button
                className='number-navigation-button'
                variant='transparent'
                color='gray'
                disabled={isLastPage}
                onClick={() => onChangeValue(nextPageValue)}
            >
                <IconArrowRight />
            </Button>
        </Group>
    );
}
