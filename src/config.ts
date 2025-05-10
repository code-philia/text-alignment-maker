import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { produce } from 'immer';
import { useCookie } from 'react-use';

interface ConfigItemDefinition<T> {
    default: T;
    cookieKey?: string;
    mountedFallback?: (value: T | null) => T;
}

type ConfigSchema = {
    [K: string]: ConfigItemDefinition<any>;
};

type ConfigValues<T extends ConfigSchema> = {
    [K in keyof T]: T[K]['default'];
};

export type WritableConfig<T extends ConfigSchema> = {
    -readonly [K in keyof ConfigValues<T>]: ConfigValues<T>[K];
};

interface CookieRef {
    value: string | null;
    setter: (value: string, options?: Cookies.CookieAttributes) => void;
    remover: () => void;
}

function createConfigItem<T>(defaultValue: T, cookieKey?: string, mountedFallback?: (value: T | null) => T): ConfigItemDefinition<T> {
    return {
        default: defaultValue,
        cookieKey,
        mountedFallback
    };
}

function useWritableConfig<T extends { [keys: string]: any }>(
    state: T,
    setters: ((property: string, value: any) => void)[] = []
) {
    const baseObject = useMemo(() => {
        const obj = {} as T;
        
        Object.keys(state).forEach(key => {
            Object.defineProperty(obj, key, {
                value: state[key],
                writable: true,
                configurable: true,
                enumerable: true
            });
        });
        
        return obj;
    }, [state]);

    const configProxy = useMemo(() => new Proxy(baseObject, {
        set(target, property: string, value) {
            if (property in target) {
                target[property as keyof T] = value;
                for (const f of setters) {
                    f(property, value);
                }
                return true;
            }

            return false;
        },
        get(target, property: string) {
            return target[property as keyof T];
        }
    }), [baseObject, setters]);

    return configProxy as WritableConfig<T>;
}

export function useSmartConfig<T extends ConfigSchema>(schema: T, setters: ((property: string, value: any) => void)[] = []): WritableConfig<T> {
    const [state, setState] = useState<ConfigValues<T>>(() =>
        Object.fromEntries(
            Object.entries(schema).map(([key, item]) => [key, item.default])
        ) as ConfigValues<T>
    );

    const [firstLoaded, setFirstLoaded] = useState(true);       // firstLoaded should be a state, not ref, because the "useEffect with dependency list" will not be triggered in written order
    const cookieRefs = useRef<Record<string, CookieRef>>({});

    Object.entries(schema).forEach(([key, item]) => {
        if (item.cookieKey) {
            // assume the number of keys in T is constant
            /* eslint-disable-next-line react-hooks/rules-of-hooks */
            const [value, setter, remover] = useCookie(item.cookieKey!);
            cookieRefs.current[key] = { value, setter, remover };
        }
    });

    useEffect(() => {
        if (!firstLoaded) {
            Object.entries(cookieRefs.current).forEach(([key, { setter }]) => {
                const value = state[key as keyof T];
                setter(typeof value === 'object' ? JSON.stringify(value) : String(value));
            });
        }
    }, [state]);    // PITFALL this should be done before the next useEffect, prevent firstLoaded from being set false

    useEffect(() => {
        if (firstLoaded) {
            setState(produce((draft: any) => {
                Object.entries(cookieRefs.current).forEach(([key, { value }]) => {
                    let process = schema[key]?.mountedFallback;
                    if (!process) {
                        process = (x) => x;     // pass through
                    }

                    if (value !== null) {
                        const schemaItem = schema[key as keyof T];
                        const schemaType = typeof schemaItem.default;

                        if (schemaType === 'boolean') {
                            (draft)[key] = process(value === 'true');
                        } else {
                            try {
                                (draft)[key] = process(
                                    schemaType === 'object'
                                        ? JSON.parse(value)
                                        : value
                                    );
                            } catch {
                                (draft)[key] = process(value);
                            }
                        } 
                    } else {
                        (draft)[key] = process((draft)[key]);
                    }
                });
            }));
            setFirstLoaded(false);
        }
    }, [schema]);   // PITFALL this is setState after the first render !!! and before the resetting of label colors in feature.tsx

    const setter = useCallback((property: string, value: any) => {
        setState(produce((draft: any) => {
            (draft)[property] = value;
        }));
    }, [setState]);
    
    setters.push(setter);

    return useWritableConfig(state, setters);
}

// setup default config

export const globalMakerConfigSchema = {
    tokensDirectory: createConfigItem('/demo', 'tokens-directory'),
    outlineTokens: createConfigItem(true, 'outline-tokens'),
    showTeacherSamples: createConfigItem(false, 'show-teacher-samples'),
    labelColors: createConfigItem<string[]>([], 'label-colors', (v) => {
        if (v === null || v.length === 0) {
            return getDefaultLabelColors(); 
        }
        return v;
    }),

    completeCodeTokensFile: createConfigItem('tokenized_code_tokens_train.jsonl', 'complete-code-tokens-file'),
    completeCommentTokensFile: createConfigItem('tokenized_comment_tokens_train.jsonl', 'complete-comment-tokens-file'),
    fullTextFile: createConfigItem('train.jsonl', 'train-data-file'),
    labelingFile: createConfigItem('sorted_labelling_sample_api.jsonl', 'labeling-file'),
    teacherFile: createConfigItem('student_teachers_pairs.jsonl', 'teacher-file'),
    highlightFile: createConfigItem('auto_highlight.jsonl', 'highlighted-code-file'),

    gptApiUrl: createConfigItem('/', 'gpt-api-url'),
    openAiApiKey: createConfigItem('', 'open-ai-api-key'),

    useAdvancedFeatures: createConfigItem(false, 'use-advanced-features'),
    showExternalLabeling: createConfigItem(false, 'show-external-labeling'),
    showExternalLabelingScore: createConfigItem(true, 'show-external-labeling-score'),
    showExternalLabelingScoreInPercentage: createConfigItem(true, 'show-external-labeling-score-in-percentage')
} as const;

export const globalMakerConfigSettersContext: ((property: string, value: any) => void)[] = [];

export type MakerConfig = ConfigValues<typeof globalMakerConfigSchema>;

export const simpleMantineStandardColors = ['green', 'red', 'yellow', 'orange', 'cyan', 'lime', 'pink', 'gray', 'grape', 'violet', 'indigo', 'teal'];

export function convertMantineColorToRgb(colorName: string) {
    const computedRgbStyle = getComputedStyle(document.documentElement)
        .getPropertyValue(`--mantine-color-${colorName}-filled`);
    return computedRgbStyle !== '' ? computedRgbStyle : '#ffffff';
}

export function getDefaultLabelColors() {
    return simpleMantineStandardColors.map(convertMantineColorToRgb);
}
