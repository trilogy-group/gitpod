/**
 * Copyright (c) 2020 TypeFox GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License-AGPL.txt in the project root for license information.
 */

import * as util from 'util';
import { injectable, inject, postConstruct } from 'inversify';
import { GitpodTaskServer, GitpodTaskClient, GitpodTask, IsTaskTerminalAttachedParams } from '../common/gitpod-task-protocol';
import { SupervisorClientProvider } from './supervisor-client-provider';
import { TasksStatusRequest, TasksStatusResponse } from '@gitpod/supervisor-api-grpc/lib/status_pb';
import { ApplicationShell } from '@theia/core/lib/browser';
import { Deferred } from '@theia/core/lib/common/promise-util';
import psTree = require('ps-tree');

@injectable()
export class GitpodTaskServerImpl implements GitpodTaskServer {

    protected run = true;
    protected stopUpdates: (() => void) | undefined;

    private readonly clients = new Set<GitpodTaskClient>();

    private readonly tasks = new Map<string, GitpodTask>();
    private readonly deferredReady = new Deferred<void>();

    @inject(SupervisorClientProvider)
    private readonly supervisorClientProvider: SupervisorClientProvider;

    @postConstruct()
    async start(): Promise<void> {
        const client = await this.supervisorClientProvider.getStatusClient();
        while (this.run) {
            try {
                const req = new TasksStatusRequest();
                req.setObserve(true);
                const evts = client.tasksStatus(req);
                this.stopUpdates = evts.cancel;

                await new Promise((resolve, reject) => {
                    evts.on("close", resolve);
                    evts.on("error", reject);
                    evts.on("data", (response: TasksStatusResponse) => {
                        const updated: GitpodTask[] = [];
                        for (const task of response.getTasksList()) {
                            const openIn = task.getPresentation()!.getOpenIn();
                            const openMode = task.getPresentation()!.getOpenMode();
                            const update: GitpodTask = {
                                id: task.getId(),
                                state: task.getState() as number,
                                terminal: task.getTerminal(),
                                presentation: {
                                    name: task.getPresentation()!.getName(),
                                    // grpc inserts empty strings for optional properties of string type :(
                                    openIn: !!openIn ? openIn as ApplicationShell.WidgetOptions['area'] | undefined : undefined,
                                    openMode: !!openMode ? openMode as ApplicationShell.WidgetOptions['mode'] | undefined : undefined
                                }
                            }
                            this.tasks.set(task.getId(), update);
                            updated.push(update);
                        }
                        this.deferredReady.resolve();
                        for (const client of this.clients) {
                            client.onDidChange({ updated });
                        }
                    });
                });
            } catch (err) {
                console.error("cannot maintain connection to supervisor", err);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    async getTasks(): Promise<GitpodTask[]> {
        await this.deferredReady.promise;
        return [...this.tasks.values()];
    }

    async isAttached({ processId }: IsTaskTerminalAttachedParams): Promise<boolean> {
        const children = await util.promisify(psTree)(processId);
        return children.some(child => child.COMMAND === 'supervisor');
    }

    setClient(client: GitpodTaskClient): void {
        this.clients.add(client);
    }
    disposeClient(client: GitpodTaskClient): void {
        this.clients.delete(client);
    }

    dispose(): void {
        this.run = false;
        if (!!this.stopUpdates) {
            this.stopUpdates();
        }
    }

}