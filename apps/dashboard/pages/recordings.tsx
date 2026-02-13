import { Recording } from '@prisma/client';
import clsx from 'clsx';
import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useState } from 'react';

import Button from '../components/button';
import Link from '../components/link';
import Section from '../components/section';
import prisma from '../lib/prisma';
import { getAvatarUrl, parseUser } from '../utils';
import { DiscordUser } from '../utils/types';

interface RecordingItem {
    id: string;
    accessKey: string;
    createdAt: string;
    endedAt: string | null;
    expiresAt: string;
    channelId: string;
    guildId: string;
    autorecorded: boolean;
}

interface Props {
    user: DiscordUser;
    recordings: RecordingItem[];
}

function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

function formatDuration(start: string, end: string | null): string {
    if (!end) return 'In progress';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

function isExpired(expiresAt: string): boolean {
    return new Date(expiresAt).getTime() < Date.now();
}

export default function Recordings(props: Props) {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const allSelectable = props.recordings.filter((r) => !isExpired(r.expiresAt));
    const allSelected = allSelectable.length > 0 && selected.size === allSelectable.length;

    function toggleSelect(id: string) {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleAll() {
        if (allSelected) {
            setSelected(new Set());
        } else {
            setSelected(new Set(allSelectable.map((r) => r.id)));
        }
    }

    function downloadSelected() {
        const toDownload = props.recordings.filter(
            (r) => selected.has(r.id) && !isExpired(r.expiresAt)
        );
        toDownload.forEach((r, i) => {
            setTimeout(() => {
                window.open(`/rec/${r.id}?key=${r.accessKey}`, '_blank');
            }, i * 500);
        });
    }

    return (
        <>
            <Head>
                <title>My Recordings — Yeecord</title>
                <meta name="viewport" content="width=device-width,initial-scale=1" />
                <meta httpEquiv="Content-Type" content="text/html; charset=UTF-8" />
                <meta httpEquiv="Content-Language" content="en" />
                <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
                <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
                <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
                <link rel="mask-icon" href="/safari-pinned-tab.svg" color="#2dd4bf" />
                <meta name="msapplication-TileColor" content="#2dd4bf" />
                <meta name="theme-color" content="#2dd4bf" />
            </Head>
            <div className="min-h-screen bg-gradient-to-t from-neutral-800 to-zinc-900 text-white font-body flex items-center justify-center flex-col py-12 sm:px-12">
                <div className="bg-zinc-700 sm:rounded flex justify-center items-center sm:shadow-md w-full flex-col sm:w-4/5 sm:max-w-4xl">
                    <h1 className="text-3xl flex justify-center p-3 gap-4 items-center relative bg-black bg-opacity-20 w-full font-body">
                        <img src={getAvatarUrl(props.user)} className="w-12 h-12 rounded-full" />
                        <span>My Recordings</span>
                    </h1>
                    <div className="flex flex-col justify-center items-center p-6 gap-4 w-full">
                        <div className="flex justify-between items-center w-full">
                            <Button onClick={() => (location.href = '/')}>
                                ← Back to Dashboard
                            </Button>
                            {allSelectable.length > 0 && (
                                <div className="flex gap-2 items-center">
                                    <button
                                        onClick={toggleAll}
                                        className="text-sm text-zinc-400 hover:text-white transition-colors"
                                    >
                                        {allSelected ? 'Deselect All' : 'Select All'}
                                    </button>
                                    {selected.size > 0 && (
                                        <Button type="brand" onClick={downloadSelected}>
                                            Download {selected.size} Selected
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>

                        {props.recordings.length === 0 ? (
                            <div className="text-zinc-400 py-8 text-center">
                                <p className="text-lg">No recordings yet.</p>
                                <p className="text-sm mt-2">Use <code className="bg-zinc-600 px-1 rounded">/join</code> in a voice channel to start recording.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2 w-full">
                                {props.recordings.map((rec) => {
                                    const expired = isExpired(rec.expiresAt);
                                    return (
                                        <div
                                            key={rec.id}
                                            className={clsx(
                                                'flex items-center gap-3 p-3 rounded-md transition-colors w-full',
                                                {
                                                    'bg-zinc-600': !expired,
                                                    'bg-zinc-800 opacity-50': expired
                                                }
                                            )}
                                        >
                                            {!expired && (
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(rec.id)}
                                                    onChange={() => toggleSelect(rec.id)}
                                                    className="w-4 h-4 rounded accent-teal-500 cursor-pointer flex-shrink-0"
                                                />
                                            )}
                                            <div className="flex flex-col flex-grow min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-mono text-sm text-teal-400">{rec.id}</span>
                                                    {rec.autorecorded && (
                                                        <span className="text-xs bg-zinc-500 px-1.5 py-0.5 rounded">Auto</span>
                                                    )}
                                                    {expired && (
                                                        <span className="text-xs bg-red-900 text-red-300 px-1.5 py-0.5 rounded">Expired</span>
                                                    )}
                                                    {!rec.endedAt && (
                                                        <span className="text-xs bg-green-900 text-green-300 px-1.5 py-0.5 rounded">Recording…</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-zinc-400 mt-1 flex gap-3 flex-wrap">
                                                    <span>{formatDate(rec.createdAt)}</span>
                                                    <span>Duration: {formatDuration(rec.createdAt, rec.endedAt)}</span>
                                                    {!expired && <span>Expires: {formatDate(rec.expiresAt)}</span>}
                                                </div>
                                            </div>
                                            {!expired && (
                                                <a
                                                    href={`/rec/${rec.id}?key=${rec.accessKey}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex-shrink-0 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 rounded-md text-sm font-medium transition-colors"
                                                >
                                                    Download
                                                </a>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

export const getServerSideProps: GetServerSideProps<Props> = async function (ctx) {
    const user = parseUser(ctx.req);

    if (!user)
        return {
            redirect: {
                destination: '/login',
                permanent: false
            }
        };

    const recordings = await prisma.recording.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
            id: true,
            accessKey: true,
            createdAt: true,
            endedAt: true,
            expiresAt: true,
            channelId: true,
            guildId: true,
            autorecorded: true
        }
    });

    return {
        props: {
            user,
            recordings: recordings.map((r) => ({
                ...r,
                createdAt: r.createdAt.toISOString(),
                endedAt: r.endedAt?.toISOString() || null,
                expiresAt: r.expiresAt.toISOString()
            }))
        }
    };
};
