import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';

const GOOGLE_BLUE = '#4285f4';
const GOOGLE_RED = '#ea4335';
const GOOGLE_YELLOW = '#fbbc05';
const GOOGLE_GREEN = '#34a853';

type Props = {
    style?: StyleProp<TextStyle>;
};

export function GoogleWord({ style }: Props) {
    return (
        <Text style={style}>
            <Text style={{ color: GOOGLE_BLUE }}>G</Text>
            <Text style={{ color: GOOGLE_RED }}>o</Text>
            <Text style={{ color: GOOGLE_YELLOW }}>o</Text>
            <Text style={{ color: GOOGLE_BLUE }}>g</Text>
            <Text style={{ color: GOOGLE_GREEN }}>l</Text>
            <Text style={{ color: GOOGLE_RED }}>e</Text>
        </Text>
    );
}
