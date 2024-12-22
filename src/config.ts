import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { produce } from 'immer';
import { useCookie } from 'react-use';

interface ConfigItemDefinition<T> {
    default: T;
    cookieKey?: string;
}

type ConfigSchema = {
    [K: string]: ConfigItemDefinition<any>;
};

type ConfigValues<T extends ConfigSchema> = {
    [K in keyof T]: T[K]['default'];
};

type WritableConfig<T extends ConfigSchema> = {
    -readonly [K in keyof ConfigValues<T>]: ConfigValues<T>[K];
};

interface CookieRef {
    value: string | null;
    setter: (value: string, options?: Cookies.CookieAttributes) => void;
    remover: () => void;
}

function createConfigItem<T>(defaultValue: T, cookieKey?: string): ConfigItemDefinition<T> {
    return {
        default: defaultValue,
        cookieKey
    };
}

function useWritableConfig<T extends { [keys: string]: any }>(
    state: T,
    setter: (property: string, value: any) => void
) {
    // 创建可写的基础对象
    const baseObject = useMemo(() => {
        const obj = {} as T;
        
        // 为每个属性设置可写的描述符
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

    // 创建 Proxy
    const configProxy = useMemo(() => new Proxy(baseObject, {
        set(target, property: string, value) {
            if (property in target) {
                target[property as keyof T] = value;
                setter(property, value);
                return true;
            }
            return false;
        },
        get(target, property: string) {
            return target[property as keyof T];
        }
    }), [baseObject, setter]);

    return configProxy as WritableConfig<T>;
}

export function useSmartConfig<T extends ConfigSchema>(schema: T): WritableConfig<T> {
    const [state, setState] = useState<ConfigValues<T>>(() =>
        Object.fromEntries(
            Object.entries(schema).map(([key, item]) => [key, item.default])
        ) as ConfigValues<T>
    );

    const firstLoaded = useRef(true);
    const cookieRefs = useRef<Record<string, CookieRef>>({});

    Object.entries(schema).forEach(([key, item]) => {
        if (item.cookieKey) {
            const [value, setter, remover] = useCookie(item.cookieKey!);
            cookieRefs.current[key] = { value, setter, remover };
        }
    });

    useEffect(() => {
        if (firstLoaded.current) {
            setState(produce((draft: any) => {
                Object.entries(cookieRefs.current).forEach(([key, { value }]) => {
                    if (value !== null) {
                        const schemaItem = schema[key as keyof T];
                        const schemaType = typeof schemaItem.default;

                        if (schemaType === 'boolean') {
                            (draft)[key] = value === 'true';
                        } else {
                            try {
                                (draft)[key] = schemaType === 'object'
                                    ? JSON.parse(value)
                                    : value;
                            } catch {
                                (draft)[key] = value;
                            }
                        }
                    }
                });
            }));
            firstLoaded.current = false;
        }
    }, [schema]);

    useEffect(() => {
        if (!firstLoaded.current) {
            Object.entries(cookieRefs.current).forEach(([key, { setter }]) => {
                const value = state[key as keyof T];
                setter(typeof value === 'object' ? JSON.stringify(value) : String(value));
            });
        }
    }, [state]);

    const setter = useCallback((property: string, value: any) => {
        setState(produce((draft: any) => {
            (draft)[property] = value;
        }));
    }, [setState]);
    
    return useWritableConfig(state, setter);
}

// setup default config

export const simpleMantineStandardColors = ['green', 'red', 'yellow', 'orange', 'cyan', 'lime', 'pink', 'gray', 'grape', 'violet', 'indigo', 'teal'];
export function convertMantineColorToRgb(colorName: string) {
    const computedRgbStyle = getComputedStyle(document.documentElement)
        .getPropertyValue(`--mantine-color-${colorName}-filled`);
    return computedRgbStyle !== '' ? computedRgbStyle : '#ffffff';
}

export function getDefaultLabelColors() {
    return simpleMantineStandardColors.map(convertMantineColorToRgb);
}

export const globalMakerConfigSchema = {
    tokensDirectory: createConfigItem('/demo', 'tokens-directory'),
    outlineTokens: createConfigItem(true, 'outline-tokens'),
    showTeacherSamples: createConfigItem(false, 'show-teacher-samples'),
    labelColors: createConfigItem<string[]>([], 'label-colors'),

    completeCodeTokensFile: createConfigItem('tokenized_code_tokens_train.jsonl', 'complete-code-tokens-file'),
    completeCommentTokensFile: createConfigItem('tokenized_comment_tokens_train.jsonl', 'complete-comment-tokens-file'),
    fullTextFile: createConfigItem('train.jsonl', 'train-data-file'),
    labelingFile: createConfigItem('sorted_labelling_sample_api.jsonl', 'labeling-file'),
    teacherFile: createConfigItem('student_teachers_pairs.jsonl', 'teacher-file')
} as const;

export type MakerConfig = ConfigValues<typeof globalMakerConfigSchema>;
