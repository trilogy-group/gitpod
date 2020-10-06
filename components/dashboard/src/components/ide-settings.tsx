/**
 * Copyright (c) 2020 TypeFox GmbH. All rights reserved.
 * Licensed under the GNU Affero General Public License (AGPL).
 * See License-AGPL.txt in the project root for license information.
 */

import * as React from 'react';
import * as protocol from '@gitpod/gitpod-protocol';
import Radio from '@material-ui/core/Radio';
import Grid from '@material-ui/core/Grid';
import FormControlLabel from '@material-ui/core/FormControlLabel';

export class IDESettingsProps {
    service: protocol.GitpodService;
    user: protocol.User;
}

export class IDESettingsState {
    settings?: protocol.IDESettings;
}

export class IDESettings extends React.Component<IDESettingsProps, IDESettingsState> {

    constructor(props: IDESettingsProps) {
        super(props);
        this.state = {};
    }

    componentWillMount() {
        this.update(this.props.user);
    }
    componentDidUpdate(prevProps: IDESettingsProps) {
        if (this.props.user !== prevProps.user) {
            this.update(this.props.user);
        }
    }

    private update(user: protocol.User) {
        const settings = user?.additionalData?.ideSettings;
        this.setState({ settings });
    }

    render() {
        return <React.Fragment>
            {this.renderRadio('Theia', 'theia')}
            {this.renderRadio('Code', 'code')}
        </React.Fragment>
    }

    private renderRadio(label: string, value: string) {
        const checked = value === (this.state.settings?.imageAlias || 'theia');
        return <Grid item xs={12}>
            <FormControlLabel control={<Radio />} label={label} value={value} checked={checked} onChange={this.updateImageAlias} />
        </Grid>;
    }

    private updateImageAlias = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        this.setState(prevState => {
            const settings = prevState.settings || {};
            if (value !== 'theia') {
                settings.imageAlias = value;
            } else {
                delete settings.imageAlias;
            }

            const additionalData = (this.props.user.additionalData || {});
            additionalData.ideSettings = settings;
            this.props.service.server.updateLoggedInUser({ additionalData }).then(e => {
                console.error('Failed to update IDE settings:', e);
            });

            return { settings };
        });
    }

}