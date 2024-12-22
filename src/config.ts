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
    }, []);
    
    const configProxy = useMemo(() => new Proxy(state, {
        set(target, property: string, value) {
            setter(property, value);
            return true;
        },
        get(target, property: string) {
            return state[property as keyof T];
        }
    }), [state, setter]);

    return configProxy as WritableConfig<T>;
}

export const globalMakerConfigSchema = {
    tokensDirectory: createConfigItem('/demo', 'tokens-directory'),
    outlineTokens: createConfigItem(true, 'outline-tokens'),
    showTeacherSamples: createConfigItem(false, 'show-teacher-samples'),
    defaultColors: createConfigItem({ primary: '#000000', secondary: '#ffffff' })
} as const;

export type MakerConfig = ConfigValues<typeof globalMakerConfigSchema>;
