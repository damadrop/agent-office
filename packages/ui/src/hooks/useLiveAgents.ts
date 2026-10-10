import { useState, useEffect } from 'react';
import { getColyseusRoom } from '../game/Game';

export interface LiveAgent {
    id: string;
    name: string;
    action: string;
    currentTask: string;
}

// Subscribes to the live agent roster from the Colyseus room state.
export function useLiveAgents(): LiveAgent[] {
    const [agents, setAgents] = useState<LiveAgent[]>([]);

    useEffect(() => {
        let room: any = null;
        const sync = () => {
            if (!room) room = getColyseusRoom();
            if (!room || !room.state || !room.state.agents) return;
            const list: LiveAgent[] = [];
            room.state.agents.forEach((a: any, id: string) => {
                list.push({
                    id,
                    name: a.name || id,
                    action: a.action || 'idle',
                    currentTask: a.currentTask || '',
                });
            });
            setAgents(list);
        };
        sync();
        const t = setInterval(sync, 2000);
        return () => clearInterval(t);
    }, []);

    return agents;
}
