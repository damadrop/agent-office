import React from 'react';
import type { LiveAgent } from '../hooks/useLiveAgents';

interface Props {
    agent?: any;
    agents?: LiveAgent[];
    selectedId?: string;
    onSelect?: (id: string) => void;
}

export function AgentInspector({ agent, agents, selectedId, onSelect }: Props) {
    if (!agent) return null;
    return (
        <div style={{ position: 'absolute', right: 20, top: 20, width: 250, backgroundColor: 'rgba(0,0,0,0.8)', color: 'white', padding: 16, borderRadius: 8 }}>
            <h3 style={{ margin: '0 0 10px 0' }}>Inspector</h3>
            {agents && agents.length > 0 && onSelect && (
                <select
                    value={selectedId || ''}
                    onChange={(e) => onSelect(e.target.value)}
                    style={{ width: '100%', padding: '6px', borderRadius: 6, border: '1px solid #444', backgroundColor: '#1a1a3e', color: 'white', fontSize: '12px', marginBottom: 10 }}
                >
                    {agents.map(a => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                </select>
            )}
            <div style={{ fontSize: '14px' }}>
                <p style={{ margin: '4px 0' }}><strong>Name:</strong> {agent.name}</p>
                <p style={{ margin: '4px 0' }}><strong>Status:</strong> {agent.status}</p>
                <p style={{ margin: '4px 0' }}><strong>Current Task:</strong> {agent.currentTask || 'None'}</p>
            </div>
        </div>
    );
}
