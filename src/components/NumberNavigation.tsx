import { Carousel } from "@mantine/carousel";
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

    const isCurrent = (i: number) => value === i;

    if (selective && !selectedValues) {
        selectedValues = [value];
    }

    const itemsArray = selective ?
        null
        :
        (
            <Carousel
                align='start'
                p='0 50'
                slideSize='fit-content'
                slidesToScroll={6}
                speed={12}
                w={600}
            >
                {
                    new Array(total).fill(0).map((_, i) => (
                        <Carousel.Slide
                            key={i + 1}
                        >
                            <Button
                                className='number-navigation-button'
                                variant={isCurrent(i) ? 'filled' : 'transparent'}
                                color={isCurrent(i) ? 'blue' : 'gray'}
                                onClick={() => onChangeValue(i)}
                            >
                                {tags ? tags[i] : i + 1}
                            </Button>
                        </Carousel.Slide>
                    ))
                }
            </Carousel>
        );

    return itemsArray;
}
