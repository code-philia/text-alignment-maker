import { Group, Button } from "@mantine/core";
import { IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { useEffect, useState } from "react";

export type NumberNavigationProps = {
    value: number;
    total: number;
    onChangeValue: (value: number) => void;

    selective?: boolean;
    selectedValues?: number[];

    tags?: string[];
}

export function NumberNavigation({ value, total, onChangeValue, selective, selectedValues, tags }: NumberNavigationProps) {
    const numOfOptions = 6;
    const [page, setPage] = useState<number>(0);

    useEffect(() => {
        setPage(Math.floor(value / numOfOptions));
    }, [value]);

    const totalPages = Math.ceil(total / numOfOptions);

    const startIndex = page * numOfOptions;
    const endIndex = Math.min(startIndex + numOfOptions, total);

    const isFirstPage = page == 0;
    const isLastPage = page >= totalPages - 1;

    const isCurrent = (i: number) => value % numOfOptions === i;
    const isSelected = (i: number) => selectedValues?.includes(i);

    const prevPageValue = Math.max(value - numOfOptions, 0);
    const nextPageValue = Math.min(value + numOfOptions, total - 1);

    if (selective && !selectedValues) {
        selectedValues = [value];
    }

    const itemsArray = selective ?
        (
            new Array(endIndex - startIndex).fill(0).map((_, i) => (
                <Button
                    key={i + 1}
                    className='number-navigation-button'
                    variant={isSelected(i) ? 'filled' : 'transparent'}
                    color={isSelected(i) ? 'blue' : 'gray'}
                    style={isSelected(i) ? {} : {}}
                    onClick={() => onChangeValue(startIndex + i)}
                >
                    {tags ? tags[startIndex + i] : (startIndex + i + 1)}
                </Button>
            ))
        )
        :
        (
            new Array(endIndex - startIndex).fill(0).map((_, i) => (
                <Button
                    key={i + 1}
                    className='number-navigation-button'
                    variant={isCurrent(i) ? 'filled' : 'transparent'}
                    color={isCurrent(i) ? 'blue' : 'gray'}
                    onClick={() => onChangeValue(startIndex + i)}
                >
                    {tags ? tags[startIndex + i] : (startIndex + i + 1)}
                </Button>
            ))
        );

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
            { itemsArray }
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
