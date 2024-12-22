type SingleRange = [number, number];

type MultipleRanges = [number, number][];

type CodeRange = SingleRange | MultipleRanges;

export type CodeData = {
    tokens: string[];
    attentions: number[];
    alignments: [CodeRange, CodeRange];
}
