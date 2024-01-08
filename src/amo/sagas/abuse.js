/* @flow */
import { call, put, select, takeLatest } from 'redux-saga/effects';

import { reportAddon as reportAddonApi } from 'amo/api/abuse';
import log from 'amo/logger';
import {
  SEND_ADDON_ABUSE_REPORT,
  abortAbuseReport,
  loadAddonAbuseReport,
} from 'amo/reducers/abuse';
import { createErrorHandler, getState } from 'amo/sagas/utils';
import type { ReportAddonParams } from 'amo/api/abuse';
import type { SendAddonAbuseReportAction } from 'amo/reducers/abuse';
import type { Saga } from 'amo/types/sagas';

export function* reportAddon({
  payload: {
    addonId,
    errorHandlerId,
    reporterEmail,
    reporterName,
    message,
    reason,
    location,
    addonVersion,
    auth,
  },
}: SendAddonAbuseReportAction): Saga {
  const errorHandler = createErrorHandler(errorHandlerId);

  yield put(errorHandler.createClearingAction());

  try {
    const state = yield select(getState);

    const params: ReportAddonParams = {
      addonId,
      api: state.api,
      reporterName: reporterName || null,
      reporterEmail: reporterEmail || null,
      message,
      reason: reason || null,
      location: location || null,
      addonVersion: addonVersion || null,
      auth,
    };
    const response = yield call(reportAddonApi, params);

    // Update the response for non-public add-ons so that the rest of our
    // (redux) logic isn't confused by the lack of information.
    if (!response.addon.id && !response.addon.slug) {
      const { addon } = response;
      response.addon = {
        ...addon,
        guid: addon.guid,
        slug: addon.guid,
      };
    }

    yield put(loadAddonAbuseReport(response));
  } catch (error) {
    log.warn(`Reporting add-on for abuse failed: ${error}`);
    yield put(errorHandler.createErrorAction(error));

    yield put(abortAbuseReport({ addonId }));
  }
}

export default function* abuseSaga(): Saga {
  yield takeLatest(SEND_ADDON_ABUSE_REPORT, reportAddon);
}
