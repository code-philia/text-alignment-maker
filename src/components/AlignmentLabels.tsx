import { Group, Badge, rem, Modal, TextInput, Button } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";

type AlignmentLabel = {
    text: string;
    color: string;
};

export type AlignmentLabelsProps = {
    labels: AlignmentLabel[];
    setLabels: (labels: AlignmentLabel[]) => void;
    onClickLabel?: (index: number) => void;
}

export function AlignmentLabels({ labels, setLabels, onClickLabel } : AlignmentLabelsProps) {
    const [newLabelText, setNewLabelText] = useState('');
    const [newLabelColor, setNewLabelColor] = useState('#000000');  // FIXME just a placeholder now, not changeable
    const [modalOpened, setModalOpened] = useState(false);

    const addLabel = () => {
        if (newLabelText.trim()) {
            setLabels([...labels, { text: newLabelText, color: newLabelColor }]);
            setNewLabelText('');
            setNewLabelColor('#000000');
            setModalOpened(false);
        }
    };

    return (
        <>
            <div style={{ padding: '20px' }}>
                <Group gap="sm">
                    {
                        labels.length > 0
                            ?
                            <Badge
                                color='black'
                                className='label-badge remove-label'
                                onMouseDown={() => onClickLabel?.(-1)}
                            >
                                Remove Label
                            </Badge>
                            :
                            <Badge
                                color='black'
                                className='label-badge remove-label'
                            >
                                No Labels Yet
                            </Badge>
                    }
                    {labels.map((label, index) => (
                        <Badge
                            key={index}
                            color={label.color}
                            variant="filled"
                            className='label-badge'
                            onMouseDown={() => onClickLabel?.(index)}
                        >
                            {label.text}
                        </Badge>
                    ))}
                    {
                        labels.length > 0
                            ?
                            <Badge
                                leftSection={<IconPlus style={{ width: rem(12), height: rem(12) }} />}
                                color='gray'
                                className='label-badge add-label'
                                onClick={() => {
                                    setNewLabelText(`Label ${labels.length + 1}`);   // FIXME this should use a same function as the setLabels function creating labels below
                                    setModalOpened(true);
                                }}
                            >
                                New
                            </Badge>
                            :
                            null
                    }
                </Group>

            </div>
            <Modal
                opened={modalOpened}
                onClose={() => setModalOpened(false)}
                title="Add New Label"
                size="sm" // Ensures the modal fits the screen better
            >
                <TextInput
                    label="Label Text"
                    placeholder="Enter label text"
                    value={newLabelText}
                    onChange={(event) => setNewLabelText(event.target.value)}
                />
                {/* <ColorInput
                    label="Label Color"
                    placeholder="Pick a color"
                    value={newLabelColor}
                    onChange={(value) => setNewLabelColor(value)}
                    style={{ marginTop: '15px' }}
                /> */}
                <Group align="right" style={{ marginTop: '20px' }}>
                    <Button onClick={addLabel}>Add</Button>
                </Group>
            </Modal>
        </>
    );
};
