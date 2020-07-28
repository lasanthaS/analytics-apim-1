/* eslint-disable require-jsdoc */
/*
 *  Copyright (c) 2020, WSO2 Inc. (http://www.wso2.org) All Rights Reserved.
 *
 *  WSO2 Inc. licenses this file to you under the Apache License,
 *  Version 2.0 (the "License"); you may not use this file except
 *  in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing,
 *  software distributed under the License is distributed on an
 *  "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 *  KIND, either express or implied.  See the License for the
 *  specific language governing permissions and limitations
 *  under the License.
 *
 */

import React from 'react';
import Widget from '@wso2-dashboards/widget';
import cloneDeep from 'lodash/cloneDeep';
import { MuiThemeProvider, createMuiTheme } from '@material-ui/core/styles';

import Axios from 'axios';
import {
    defineMessages, IntlProvider, FormattedMessage, addLocaleData,
} from 'react-intl';
import CircularProgress from '@material-ui/core/CircularProgress';
import Scrollbars from 'react-custom-scrollbars';
import CustomFormGroup from './CustomFormGroup';
import ResourceViewErrorTable from './ResourceViewErrorTable';
import { DrillDownEnum } from '../../AppAndAPIErrorTable/src/Constants';

const darkTheme = createMuiTheme({
    palette: {
        type: 'dark',
    },
    typography: {
        useNextVariants: true,
    },
});

const lightTheme = createMuiTheme({
    palette: {
        type: 'light',
    },
    typography: {
        useNextVariants: true,
    },
});

const queryParamKey = 'trafficSummary';

/**
 * Language
 * @type {string}
 */
const language = (navigator.languages && navigator.languages[0]) || navigator.language || navigator.userLanguage;

/**
 * Language without region code
 */
const languageWithoutRegionCode = language.toLowerCase().split(/[_-]+/)[0];

/**
 * Create React Component for AppAndAPIErrorsByTime
 * @class APITrafficSummaryWidget
 * @extends {Widget}
 */
class APITrafficSummaryWidget extends Widget {
    /**
     * Creates an instance of APITrafficSummaryWidget.
     * @param {any} props @inheritDoc
     * @memberof APITrafficSummaryWidget
     */
    constructor(props) {
        super(props);
        this.state = {
            width: this.props.width,
            height: this.props.height,
            localeMessages: null,
            loading: true,

            selectedAPI: -1,
            selectedVersion: -1,
            selectedResource: -1,
            selectedLimit: 10,
            apiType: null,
            drillDownType: 'api',
            data: [],

            apiList: [],
            versionList: [],
            operationList: [],

        };

        // This will re-size the widget when the glContainer's width is changed.
        if (this.props.glContainer !== undefined) {
            this.props.glContainer.on('resize', () => this.setState({
                width: this.props.glContainer.width,
                height: this.props.glContainer.height,
            }));
        }

        this.handlePublisherParameters = this.handlePublisherParameters.bind(this);
        this.handleQueryResults = this.handleQueryResults.bind(this);
        this.assembleFetchDataQuery = this.assembleFetchDataQuery.bind(this);

        this.getQueryForResource = this.getQueryForResource.bind(this);

        this.loadApis = this.loadApis.bind(this);
        this.loadVersions = this.loadVersions.bind(this);
        this.loadOperations = this.loadOperations.bind(this);

        this.handleLoadApis = this.handleLoadApis.bind(this);
        this.handleLoadVersions = this.handleLoadVersions.bind(this);
        this.handleLoadOperations = this.handleLoadOperations.bind(this);

        this.handleAPIChange = this.handleAPIChange.bind(this);
        this.handleVersionChange = this.handleVersionChange.bind(this);
        this.handleOperationChange = this.handleOperationChange.bind(this);
        this.handleLimitChange = this.handleLimitChange.bind(this);

        this.loadingDrillDownData = this.loadingDrillDownData.bind(this);

        this.handleOnClick = this.handleOnClick.bind(this);
        this.handleDrillDownTypeChange = this.handleDrillDownTypeChange.bind(this);
        this.handleGraphQLOperationChange = this.handleGraphQLOperationChange.bind(this);
    }

    componentWillMount() {
        const locale = (languageWithoutRegionCode || language || 'en');
        this.loadLocale(locale).catch(() => {
            this.loadLocale().catch(() => {
                // TODO: Show error message.
            });
        });
    }

    componentDidMount() {
        const { widgetID } = this.props;
        this.loadQueryParams();
        // This function retrieves the provider configuration defined in the widgetConf.json
        // file and make it available to be used inside the widget
        super.getWidgetConfiguration(widgetID)
            .then((message) => {
                this.setState({
                    providerConfig: message.data.configs.providerConfig,
                }, () => super.subscribe(this.handlePublisherParameters));
            })
            .catch((error) => {
                console.error("Error occurred when loading widget '" + widgetID + "'. " + error);
                this.setState({
                    faultyProviderConfig: true,
                });
            });
    }

    componentWillUnmount() {
        const { id } = this.props;
        super.getWidgetChannelManager().unsubscribeWidget(id);
        super.getWidgetChannelManager().unsubscribeWidget(id + '_loadApis');
        super.getWidgetChannelManager().unsubscribeWidget(id + '_loadVersions');
        super.getWidgetChannelManager().unsubscribeWidget(id + '_loadOperations');
    }

    /**
      * Load locale file
      * @param {string} locale Locale name
      * @memberof APITrafficSummaryWidget
      * @returns {string}
      */
    loadLocale(locale = 'en') {
        return new Promise((resolve, reject) => {
            Axios
                .get(`${window.contextPath}/public/extensions/widgets/APITrafficSummary/locales/${locale}.json`)
                .then((response) => {
                    // eslint-disable-next-line global-require, import/no-dynamic-require
                    addLocaleData(require(`react-intl/locale-data/${locale}`));
                    this.setState({ localeMessages: defineMessages(response.data) });
                    resolve();
                })
                .catch(error => reject(error));
        });
    }

    /**
     * Retrieve the filter values from query param
     * @memberof APITrafficSummary
     * */
    loadQueryParams() {
        let {
            selectedAPI, selectedVersion, selectedResource, selectedLimit, drillDownType,
        } = super.getGlobalState(queryParamKey);
        const { apiType } = super.getGlobalState(queryParamKey);

        if (!selectedLimit || selectedLimit < 0) {
            selectedLimit = 5;
        }
        if (!selectedAPI) {
            selectedAPI = -1;
        }
        if (!selectedVersion) {
            selectedVersion = -1;
        }
        if (!selectedResource) {
            selectedResource = -1;
        }
        if (!drillDownType) {
            drillDownType = 'api';
        }

        this.setState({
            selectedAPI,
            selectedVersion,
            selectedResource,
            selectedLimit,
            drillDownType,
            apiType,
        });
    }

    /**
     * Updates query param values
     * @memberof APITrafficSummary
     * */
    setQueryParams(paramsObj) {
        const existParams = super.getGlobalState(queryParamKey);
        const newParams = {};
        for (const [key, value] of Object.entries(existParams)) {
            newParams[key] = value;
        }
        for (const [key, value] of Object.entries(paramsObj)) {
            newParams[key] = value;
        }
        super.setGlobalState(queryParamKey, newParams);
    }

    /**
     * Retrieve params from publisher
     * @param {string} receivedMsg Received data from publisher
     * @memberof APITrafficSummaryWidget
     * */
    handlePublisherParameters(receivedMsg) {
        const queryParam = super.getGlobalState('dtrp');
        const { sync } = queryParam;
        this.setState({
            // Insert the code to handle publisher data
            timeFrom: receivedMsg.from,
            timeTo: receivedMsg.to,
            perValue: receivedMsg.granularity,
            loading: !sync,
        }, this.loadArtifacts);
    }

    loadArtifacts() {
        const {
            selectedAPI, selectedVersion, selectedResource, apiType,
        } = this.state;
        if (selectedVersion !== -1) {
            this.loadVersions(selectedAPI);
        }
        if (selectedResource !== -1) {
            this.loadOperations(selectedVersion, apiType);
        }
        if (selectedVersion === -1 && selectedResource === -1) {
            this.loadApis();
        }
    }

    delayedLoadVersions() {
        const {
            selectedVersion, selectedResource,
        } = this.state;
        if (selectedVersion !== -1 && selectedResource === -1) {
            this.loadApis();
        }
    }

    delayedLoadOperations() {
        const {
            selectedVersion, selectedResource,
        } = this.state;
        if (selectedVersion !== -1 && selectedResource !== -1) {
            this.loadApis();
        }
    }

    // start of filter loading
    loadApis() {
        this.loadingDrillDownData();

        const { providerConfig } = this.state;
        const { id, widgetID: widgetName } = this.props;

        const dataProviderConfigs = cloneDeep(providerConfig);
        dataProviderConfigs.configs.config.queryData.queryName = 'listApisQuery';
        super.getWidgetChannelManager()
            .subscribeWidget(id + '_loadApis', widgetName, this.handleLoadApis, dataProviderConfigs);
    }

    loadVersions(selectedAPI) {
        const { providerConfig } = this.state;
        const { id, widgetID: widgetName } = this.props;

        const dataProviderConfigs = cloneDeep(providerConfig);
        dataProviderConfigs.configs.config.queryData.queryName = 'listVersionsQuery';
        dataProviderConfigs.configs.config.queryData.queryValues = {
            '{{selectedAPI}}': selectedAPI,
        };
        super.getWidgetChannelManager()
            .subscribeWidget(id + '_loadVersions', widgetName, this.handleLoadVersions, dataProviderConfigs);
    }

    loadOperations(selectedVersion, apiType) {
        const { providerConfig } = this.state;
        const { id, widgetID: widgetName } = this.props;

        const dataProviderConfigs = cloneDeep(providerConfig);
        if (apiType === 'APIProduct') {
            dataProviderConfigs.configs = dataProviderConfigs.listProductQueryConfigs;
            const { config } = dataProviderConfigs.configs;
            config.queryData.queryName = 'productOperationsQuery';
            dataProviderConfigs.configs.config = config;
        } else {
            dataProviderConfigs.configs.config.queryData.queryName = 'listOperationsQuery';
        }
        dataProviderConfigs.configs.config.queryData.queryValues = {
            '{{selectedVersion}}': selectedVersion,
        };
        super.getWidgetChannelManager()
            .subscribeWidget(id + '_loadOperations', widgetName, this.handleLoadOperations, dataProviderConfigs);
    }

    handleLoadApis(message) {
        const { data, metadata: { names } } = message;
        const newData = data.map((row) => {
            const obj = {};
            for (let j = 0; j < row.length; j++) {
                obj[names[j]] = row[j];
            }
            return obj;
        });

        if (data.length !== 0) {
            this.setState({
                apiList: newData,
            });
        } else {
            this.setState({
                apiList: [], selectedVersion: -1, selectedResource: -1,
            });
        }
    }

    handleLoadVersions(message) {
        const { data, metadata: { names } } = message;
        const { selectedResource } = this.state;
        const newData = data.map((row) => {
            const obj = {};
            for (let j = 0; j < row.length; j++) {
                obj[names[j]] = row[j];
            }
            return obj;
        });

        if (data.length !== 0) {
            if (selectedResource !== -1) {
                this.setState({ versionList: newData }, this.delayedLoadVersions);
            } else {
                this.setState({ versionList: newData, selectedResource: -1 }, this.delayedLoadVersions);
            }
        } else {
            this.setState({ versionList: [], selectedResource: -1 });
        }
    }

    handleLoadOperations(message) {
        const { data, metadata: { names } } = message;
        const newData = data.map((row) => {
            const obj = {};
            for (let j = 0; j < row.length; j++) {
                obj[names[j]] = row[j];
            }
            return obj;
        });

        if (data.length !== 0) {
            this.setState({ operationList: newData }, this.delayedLoadOperations);
        } else {
            this.setState({ operationList: [] });
        }
    }

    // start data query functions
    assembleFetchDataQuery(selectPhase, groupByPhase, filterPhase) {
        this.setState({ loading: true });
        const {
            timeFrom, timeTo, perValue, providerConfig, selectedLimit,
        } = this.state;
        const { id, widgetID: widgetName } = this.props;
        super.getWidgetChannelManager().unsubscribeWidget(id);

        const dataProviderConfigs = cloneDeep(providerConfig);
        dataProviderConfigs.configs.config.queryData.queryName = 'drillDownQuery';
        dataProviderConfigs.configs.config.queryData.queryValues = {
            '{{from}}': timeFrom,
            '{{to}}': timeTo,
            '{{per}}': perValue,
            '{{limit}}': selectedLimit,
            '{{selectPhase}}': selectPhase.join(','),
            '{{groupByPhase}}': groupByPhase.length ? 'group by ' + groupByPhase.join(',') : '',
            '{{querystring}}': filterPhase.length > 0 ? 'AND ' + filterPhase.join(' AND ') : '',
            '{{orderBy}}': 'order by responseCount desc',
        };
        // Use this method to subscribe to the endpoint via web socket connection
        super.getWidgetChannelManager()
            .subscribeWidget(id, widgetName, this.handleQueryResults, dataProviderConfigs);
    }

    /**
     * Formats data retrieved
     * @param {object} message - data retrieved
     * @memberof APITrafficSummaryWidget
     * */
    handleQueryResults(message) {
        // Insert the code to handle the data received through query
        const { data, metadata: { names } } = message;
        const newData = data.map((row) => {
            const obj = {};
            for (let j = 0; j < row.length; j++) {
                obj[names[j]] = row[j];
            }
            return obj;
        });

        if (data.length !== 0) {
            this.setState({ data: newData, loading: false });
        } else {
            this.setState({ data: [], loading: false });
        }
    }
    // end data query functions

    handleDrillDownTypeChange(event) {
        const drillDownType = event.target.value;
        this.setQueryParams({
            drillDownType,
            selectedAPI: -1,
            selectedVersion: -1,
            selectedResource: -1,
        });
        this.setState(
            {
                drillDownType,
                data: [],
                selectedAPI: -1,
                selectedVersion: -1,
                selectedResource: -1,
                versionList: [],
                operationList: [],
            }, this.loadingDrillDownData,
        );
    }

    // start table data type query constructor
    loadingDrillDownData() {
        this.getQueryForResource();
    }

    getQueryForResource() {
        const {
            selectedAPI, selectedVersion, selectedResource, versionList, operationList, drillDownType,
        } = this.state;

        const selectPhase = [];
        const groupByPhase = [];
        const filterPhase = [];

        if (drillDownType === 'api') {
            groupByPhase.push('apiName');
        }
        if (drillDownType === 'version') {
            groupByPhase.push('apiName', 'apiVersion');
        }
        if (drillDownType === 'resource') {
            groupByPhase.push('apiName', 'apiResourceTemplate', 'apiVersion');
        }

        if (selectedAPI !== -1) {
            filterPhase.push('apiName==\'' + selectedAPI + '\'');
        }
        if (selectedVersion !== -1) {
            const api = versionList.find(i => i.API_ID === selectedVersion);
            filterPhase.push('apiVersion==\'' + api.API_VERSION + '\'');
        }
        if (Array.isArray(selectedResource)) {
            if (selectedResource.length > 0) {
                const opsString = selectedResource
                    .map(id => operationList.find(i => i.URL_MAPPING_ID === id))
                    .map(d => d.URL_PATTERN)
                    .sort()
                    .join(',');
                const firstOp = operationList.find(i => i.URL_MAPPING_ID === selectedResource[0]);
                filterPhase.push('apiResourceTemplate==\'' + opsString + '\'');
                filterPhase.push('apiMethod==\'' + firstOp.HTTP_METHOD + '\'');
            }
        } else if (selectedResource > -1) {
            const operation = operationList.find(i => i.URL_MAPPING_ID === selectedResource);
            filterPhase.push('apiResourceTemplate==\'' + operation.URL_PATTERN + '\'');
            filterPhase.push('apiMethod==\'' + operation.HTTP_METHOD + '\'');
        }
        selectPhase.push('apiName', 'apiVersion', 'apiResourceTemplate', 'apiMethod',
            'sum(responseCount) as responseCount',
            'sum(faultCount) as faultCount',
            'sum(throttledCount) as throttledCount');
        this.assembleFetchDataQuery(selectPhase, groupByPhase, filterPhase);
    }

    // end table data type query constructor


    // start of handle filter change
    handleAPIChange(data) {
        let selectedAPI;
        if (data == null) {
            selectedAPI = -1;
        } else {
            const { value } = data;
            selectedAPI = value;
            const { drillDownType } = this.state;
            if (drillDownType === DrillDownEnum.VERSION || drillDownType === DrillDownEnum.RESOURCE) {
                this.loadVersions(selectedAPI);
            }
        }
        this.setQueryParams({
            selectedAPI,
            selectedVersion: -1,
            selectedResource: -1,
        });
        this.setState({
            selectedAPI,
            versionList: [],
            operationList: [],
            selectedVersion: -1,
            selectedResource: -1,
        }, this.loadingDrillDownData);
    }

    handleVersionChange(data) {
        let selectedVersion;
        let apiType;
        if (data == null) {
            selectedVersion = -1;
        } else {
            const { value } = data;
            selectedVersion = value;
            const { drillDownType, versionList } = this.state;
            const selectedAPI = versionList.find(item => item.API_ID === selectedVersion);
            apiType = selectedAPI.API_TYPE;
            if (selectedVersion) {
                if (drillDownType === DrillDownEnum.RESOURCE && selectedAPI.API_TYPE !== 'WS') {
                    this.loadOperations(selectedVersion, selectedAPI.API_TYPE);
                }
            }
        }
        this.setQueryParams({ selectedVersion, selectedResource: -1, apiType });
        this.setState({
            selectedVersion,
            selectedResource: -1,
            operationList: [],
            apiType,
        }, this.loadingDrillDownData);
    }

    handleOperationChange(event) {
        let selectedResource;
        if (!event) {
            // handle clear dropdown
            selectedResource = -1;
        } else {
            const { value } = event;
            selectedResource = value;
        }
        this.setQueryParams({ selectedResource });
        this.setState({ selectedResource }, this.loadingDrillDownData);
    }

    handleGraphQLOperationChange(data) {
        let selectedResource;
        if (data == null || data.length === 0) {
            selectedResource = -1;
        } else {
            const ids = data.map(row => row.value);
            selectedResource = ids;
        }
        this.setState({
            selectedResource,
        }, this.loadingDrillDownData);
    }

    handleLimitChange(event) {
        let limit = (event.target.value).replace('-', '').split('.')[0];
        if (limit < 1) {
            limit = 5;
        }
        if (limit) {
            this.setQueryParams({ selectedLimit: limit });
            this.setState({ selectedLimit: limit, loading: true }, this.loadingDrillDownData);
        } else {
            const { id } = this.props;
            super.getWidgetChannelManager().unsubscribeWidget(id);
            this.setState({ selectedLimit: limit, data: [], loading: false });
        }
    }

    // end of handle filter change

    /**
     * Handle onClick and drill down
     * @memberof APITrafficSummaryWidget
     * */
    handleOnClick(event, data) {
        const { configs } = this.props;
        const { drillDownType, apiList } = this.state;

        if (configs && configs.options) {
            const { drillDown } = configs.options;

            if (drillDown !== undefined && drillDown) {
                const {
                    apiName, apiVersion, apiResourceTemplate, apiMethod,
                } = data;
                const apiType = apiList.find(i => i.API_NAME === apiName).API_TYPE;
                const dataObj = { apiType };
                if (drillDownType === DrillDownEnum.API) {
                    dataObj.api = apiName;
                } else if (drillDownType === DrillDownEnum.VERSION) {
                    dataObj.api = apiName;
                    dataObj.version = apiVersion;
                } else if (drillDownType === DrillDownEnum.RESOURCE) {
                    dataObj.api = apiName;
                    dataObj.version = apiVersion;
                    dataObj.apiResourceTemplate = apiResourceTemplate;
                    dataObj.apiMethod = apiMethod;
                }
                this.publishSelection(dataObj);
                document.getElementById('traffic-over-time').scrollIntoView();
            }
        }
        event.preventDefault();
    }

    /**
     * Publishing the selection
     * @memberof APITrafficSummaryWidget
     */
    publishSelection(message) {
        super.publish(message);
    }

    /**
     * @inheritDoc
     * @returns {ReactElement} Render the APITrafficSummaryWidget
     * @memberof APITrafficSummaryWidget
     */
    render() {
        const {
            localeMessages, viewType, valueFormatType, data, loading,
            selectedAPI, selectedVersion, selectedResource, selectedLimit, apiList,
            versionList, operationList, drillDownType,
        } = this.state;
        const { muiTheme, height } = this.props;
        const themeName = muiTheme.name;
        const styles = {
            heading: {
                margin: 'auto',
                textAlign: 'center',
                fontWeight: 'normal',
                letterSpacing: 1.5,
                paddingBottom: '10px',
                marginTop: 0,
            },
            headingWrapper: {
                margin: 'auto',
                width: '95%',
            },
            root: {
                backgroundColor: themeName === 'light' ? '#fff' : '#0e1e34',
                height: '100%',
            },
            loadingIcon: {
                margin: 'auto',
                display: 'block',
            },
            loading: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height,
            },
            contentWrapper: {
                margin: '10px',
                marginTop: '0px',
                padding: '20px',
                paddingTop: '30px',
            },
        };
        return (
            <IntlProvider
                locale={language}
                messages={localeMessages}
            >
                <MuiThemeProvider
                    theme={themeName === 'dark' ? darkTheme : lightTheme}
                >
                    <div style={styles.root}>
                        <Scrollbars style={{
                            height,
                            backgroundColor: themeName === 'dark' ? '#0e1e33' : '#fff',
                        }}
                        >
                            <div style={styles.contentWrapper}>
                                <div style={styles.headingWrapper}>
                                    <h3 style={styles.heading}>
                                        <FormattedMessage
                                            id='widget.heading'
                                            defaultMessage='API USAGE SUMMARY'
                                        />
                                    </h3>
                                </div>
                                <CustomFormGroup
                                    viewType={viewType}
                                    valueFormatType={valueFormatType}

                                    selectedAPI={selectedAPI}
                                    selectedVersion={selectedVersion}
                                    selectedResource={selectedResource}
                                    selectedLimit={selectedLimit}

                                    apiList={apiList}
                                    versionList={versionList}
                                    operationList={operationList}

                                    handleAPIChange={this.handleAPIChange}
                                    handleVersionChange={this.handleVersionChange}
                                    handleOperationChange={this.handleOperationChange}
                                    handleDrillDownTypeChange={this.handleDrillDownTypeChange}
                                    handleGraphQLOperationChange={this.handleGraphQLOperationChange}
                                    drillDownType={drillDownType}
                                    handleLimitChange={this.handleLimitChange}
                                />
                                {!loading ? (
                                    <ResourceViewErrorTable
                                        data={data}
                                        viewType={viewType}
                                        valueFormatType={valueFormatType}
                                        handleOnClick={this.handleOnClick}
                                        themeName={themeName}
                                        drillDownType={drillDownType}
                                    />
                                )
                                    : (
                                        <div style={styles.loading}>
                                            <CircularProgress style={styles.loadingIcon} />
                                        </div>
                                    )
                                }
                            </div>
                        </Scrollbars>
                    </div>
                </MuiThemeProvider>
            </IntlProvider>
        );
    }
}

// Use this method to register the react component as a widget in the dashboard.
global.dashboard.registerWidget('APITrafficSummary', APITrafficSummaryWidget);
