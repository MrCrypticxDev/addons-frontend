/* @flow */
import config from 'config';
import * as React from 'react';
import { Helmet } from 'react-helmet';
import { connect } from 'react-redux';
import { compose } from 'redux';

import { CLIENT_APP_ANDROID } from 'amo/constants';
import translate from 'amo/i18n/translate';
import type { AppState } from 'amo/store';
import type { I18nType } from 'amo/types/i18n';
import { getCanonicalURL, sanitizeHTML } from 'amo/utils';

import defaultImage from './img/default-og-image.png';

export type DefaultProps = {|
  _config?: typeof config,
  appendDefaultTitle?: boolean,
|};

export type Props = {|
  ...DefaultProps,
  date?: Date | null,
  description?: string | null,
  image?: string | null,
  lastModified?: string | null,
  queryString?: string,
  title?: string | null,
|};

type PropsFromState = {|
  clientApp: string,
  lang: string,
  locationPathname: string,
|};

type InternalProps = {|
  ...Props,
  ...PropsFromState,
  i18n: I18nType,
|};

export class HeadMetaTagsBase extends React.PureComponent<InternalProps> {
  static defaultProps: DefaultProps = {
    _config: config,
    appendDefaultTitle: true,
  };

  getDescription(): string {
    const { description } = this.props;

    return sanitizeHTML(description).__html;
  }

  getImage(): string {
    const { image } = this.props;

    if (image) {
      return image;
    }

    return defaultImage;
  }

  getTitle(): string {
    const {
      clientApp,
      i18n,
      lang: locale,
      title,
      appendDefaultTitle,
    } = this.props;

    let i18nTitle;
    let i18nValues = { locale };

    if (title) {
      if (!appendDefaultTitle) {
        return title;
      }

      i18nTitle =
        clientApp === CLIENT_APP_ANDROID
          ? i18n.gettext('%(title)s – Add-ons for Firefox Android (%(locale)s)')
          : i18n.gettext('%(title)s – Add-ons for Firefox (%(locale)s)');
      i18nValues = { ...i18nValues, title };
    } else {
      i18nTitle =
        clientApp === CLIENT_APP_ANDROID
          ? i18n.gettext('Add-ons for Firefox Android (%(locale)s)')
          : i18n.gettext('Add-ons for Firefox (%(locale)s)');
    }

    return i18n.sprintf(i18nTitle, i18nValues);
  }

  renderOpenGraph(): Array<React.Node> {
    const { _config, lang, locationPathname, queryString } = this.props;

    const url = `${getCanonicalURL({
      _config,
      locationPathname,
    })}${queryString || ''}`;

    const tags = [
      <meta key="og:type" property="og:type" content="website" />,
      <meta key="og:url" property="og:url" content={url} />,
      <meta key="og:title" property="og:title" content={this.getTitle()} />,
      <meta key="og:locale" property="og:locale" content={lang} />,
      <meta key="og:image" property="og:image" content={this.getImage()} />,
    ];

    const description = this.getDescription();

    if (description) {
      tags.push(
        <meta
          key="og:description"
          property="og:description"
          content={description}
        />,
      );
    }

    return tags;
  }

  render(): React.Node {
    const { date, lastModified } = this.props;
    const description = this.getDescription();

    return (
      <Helmet>
        {description && <meta name="description" content={description} />}
        {date && <meta name="date" content={date} />}
        {lastModified && <meta name="last-modified" content={lastModified} />}
        {this.renderOpenGraph()}
      </Helmet>
    );
  }
}

const mapStateToProps = (state: AppState): PropsFromState => {
  const { clientApp, lang } = state.api;
  const { pathname: locationPathname } = state.router.location;

  return {
    clientApp,
    lang,
    locationPathname,
  };
};

const HeadMetaTags: React.ComponentType<Props> = compose(
  connect(mapStateToProps),
  translate(),
)(HeadMetaTagsBase);

export default HeadMetaTags;
