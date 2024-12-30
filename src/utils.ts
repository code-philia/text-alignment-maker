// other utils

export function tryStringifyJson(target: any): string | undefined {
    try {
        if (typeof target === 'string') {
            return target;
        }

        const result = JSON.stringify(target);
        return result;
    } catch (e) {
        return undefined;
    }
}

export function deepCopyNestedArrays(target: any) {
    return JSON.parse(JSON.stringify(target));
}

// NLP specific 

export function matchToIndices(match: number[][][]): number[][][] {
    return match.map(
        (label) => label.map((group) => new RangesArrayOfToken(group).expand())
    );
}
export function indicesToMatch(indices: number[][][]): number[][][] {
    return indices.map(
        (label) => label.map((group) => group ? RangesArrayOfToken.reduceFrom(group).value : [])
    );
}

// experiment data specific

export function isSpecialToken(token: string) {
    return token.startsWith('<') && token.endsWith('>');
}
export function removeDocstrings(code: string): string {
    code = code.replace(/""".*?"""/gs, '');
    code = code.replace(/'''.*?'''/gs, '');
    return code;
}
export function findCommentEnd(s: string, pos: number): number {
    let i = pos;

    while (i < s.length && /\s/.test(s[i])) {
        i++;
    }

    if (s[i] === '#') {
        while (i < s.length && s[i] !== '\n') {
            i++;
        }
    }

    return i;
}

class RangesArrayOfToken {
    value: number[];

    constructor(value: number[]) {
        this.value = value;
    }

    expand() {
        const indices = [];
        const ranges = this.value;

        for (let i = 0; i < ranges.length; i += 2) {
            if (i + 1 >= ranges.length) break;

            for (let j = ranges[i]; j <= ranges[i + 1]; ++j) {
                indices.push(j);
            }
        }

        return indices;
    }

    static reduceFrom(indices: number[]): RangesArrayOfToken {
        // make indices sorted
        indices.sort((a, b) => a - b);

        const ranges: number[] = [];

        let start = indices[0];
        let end = indices[0];
        for (let i = 1; i < indices.length; ++i) {
            if (indices[i] <= end + 1) {
                if (indices[i] == end + 1) {
                    end = indices[i];
                }
            } else {
                ranges.push(start, end);
                start = indices[i];
                end = indices[i];
            }
        }
        if (start !== undefined && end !== undefined) { // FIXME Written too many code to guarantee the structure of output (number[label][2][2 * range]). Write less or add test.
            ranges.push(start, end);
        }

        return new RangesArrayOfToken(ranges);
    }
}
