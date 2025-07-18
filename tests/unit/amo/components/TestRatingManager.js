import * as React from 'react';
import defaultUserEvent from '@testing-library/user-event';

import { createApiError } from 'amo/api';
import {
  ADDON_TYPE_DICT,
  ADDON_TYPE_EXTENSION,
  ADDON_TYPE_LANG,
  ADDON_TYPE_STATIC_THEME,
} from 'amo/constants';
import {
  FETCH_LATEST_USER_REVIEW,
  SAVED_RATING,
  STARTED_SAVE_RATING,
  createAddonReview,
  fetchLatestUserReview,
  flashReviewMessage,
  hideFlashedReviewMessage,
  setLatestReview,
  setReview,
  updateAddonReview,
} from 'amo/actions/reviews';
import RatingManager from 'amo/components/RatingManager';
import {
  createFailedErrorHandler,
  createInternalAddonWithLang,
  createInternalVersionWithLang,
  createLocalizedString,
  dispatchClientMetadata,
  dispatchSignInActionsWithStore,
  fakeAddon,
  fakeReview,
  fakeVersion,
  render as defaultRender,
  screen,
} from 'tests/unit/helpers';

// We need to mock validAddonTypes in a test.
const mockValidAddonTypesGetter = jest.fn();
jest.mock('amo/constants', () => ({
  ...jest.requireActual('amo/constants'),
  get validAddonTypes() {
    return mockValidAddonTypesGetter();
  },
}));

describe(__filename, () => {
  let store;
  let userEvent;
  const defaultAddonName = 'My Add-On';
  const defaultAddonId = 123;
  const defaultUserId = 456;
  const errorHandlerId = 'RatingManager';

  beforeEach(() => {
    store = dispatchClientMetadata().store;
    userEvent = defaultUserEvent.setup({ delay: null });
  });

  afterEach(() => {
    jest.clearAllMocks().resetModules();
  });

  const render = ({
    addonId = defaultAddonId,
    addonName = defaultAddonName,
    addon = createInternalAddonWithLang({
      ...fakeAddon,
      id: addonId,
      name: createLocalizedString(addonName),
    }),
    location,
    version = createInternalVersionWithLang(fakeVersion),
    ...props
  } = {}) => {
    return defaultRender(
      <RatingManager addon={addon} version={version} {...props} />,
      { store },
    );
  };

  const renderWithReview = ({
    addonName = defaultAddonName,
    addon = createInternalAddonWithLang({
      ...fakeAddon,
      id: defaultAddonId,
      name: createLocalizedString(addonName),
    }),
    userId = defaultUserId,
    review = { ...fakeReview, user: { ...fakeReview.user, id: userId } },
    signIn = true,
  } = {}) => {
    if (signIn) {
      dispatchSignInActionsWithStore({ store, userId });
    }

    if (review) {
      store.dispatch(setReview(review));
    }

    store.dispatch(
      setLatestReview({
        addonId: addon.id,
        review,
        userId,
      }),
    );

    render({ addon });
    return { addon, review };
  };

  it('doesnt show any prompt when not deleting', () => {
    const name = 'Some Add-on';
    render({
      addon: createInternalAddonWithLang({
        ...fakeAddon,
        name: createLocalizedString(name),
      }),
    });

    expect(screen.queryByText(`of ${name}?`)).not.toBeInTheDocument();
  });

  it('dispatches fetchLatestUserReview on construction', () => {
    const addonId = 123;
    const userId = 12889;
    const addon = createInternalAddonWithLang({ ...fakeAddon, id: addonId });
    dispatchSignInActionsWithStore({ store, userId });
    const dispatch = jest.spyOn(store, 'dispatch');

    render({ addon });

    expect(dispatch).toHaveBeenCalledWith(
      fetchLatestUserReview({
        addonId: addon.id,
        addonSlug: addon.slug,
        errorHandlerId,
        userId,
      }),
    );
  });

  it('does not fetchLatestUserReview when a null one was already fetched', () => {
    const dispatch = jest.spyOn(store, 'dispatch');
    renderWithReview({ review: null });

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: FETCH_LATEST_USER_REVIEW }),
    );
  });

  it('does not fetchLatestUserReview if there is an error', () => {
    const addon = createInternalAddonWithLang(fakeAddon);
    dispatchSignInActionsWithStore({ store, userId: defaultUserId });
    createFailedErrorHandler({
      id: errorHandlerId,
      store,
    });

    const dispatch = jest.spyOn(store, 'dispatch');
    render({ addon });

    expect(dispatch).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: FETCH_LATEST_USER_REVIEW }),
    );
  });

  it('dispatches fetchLatestUserReview if there was a 429 error', () => {
    const addonId = 123;
    const userId = 12889;
    const addon = createInternalAddonWithLang({ ...fakeAddon, id: addonId });
    dispatchSignInActionsWithStore({ store, userId });
    createFailedErrorHandler({
      id: errorHandlerId,
      error: createApiError({ response: { status: 429 } }),
      store,
    });

    const dispatch = jest.spyOn(store, 'dispatch');

    render({ addon });

    expect(dispatch).toHaveBeenCalledWith(
      fetchLatestUserReview({
        addonId: addon.id,
        addonSlug: addon.slug,
        errorHandlerId,
        userId,
      }),
    );
  });

  it('passes review=undefined before the saved review has loaded', () => {
    dispatchSignInActionsWithStore({ store, userId: defaultUserId });
    render();

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(
      screen.queryByTitle('There are no ratings yet'),
    ).not.toBeInTheDocument();
  });

  it('passes review=null if no user is signed in', () => {
    render();

    expect(screen.getAllByTitle('There are no ratings yet')).toHaveLength(6);
    // This does not trigger a loading state.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('passes the review once it has loaded', () => {
    renderWithReview({ review: { ...fakeReview, score: 1 } });

    expect(screen.getByTitle('Rated 1 out of 5')).toBeInTheDocument();
  });

  it('passes review=null when no saved review exists', () => {
    renderWithReview({ review: null });

    // This exits the loading state.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('flashes a saving rating message', () => {
    // This is dispatched via a saga, so we need to dispatch it manually.
    store.dispatch(flashReviewMessage(STARTED_SAVE_RATING));
    renderWithReview();

    const flashMessage = screen.getByClassName(
      'RatingManagerNotice-savedRating',
    );
    expect(flashMessage).toHaveTextContent('Saving star rating');
    expect(flashMessage).toHaveClass('Notice-generic');
    expect(flashMessage).toHaveClass('RatingManager-savedRating-withReview');
    expect(flashMessage).not.toHaveClass(
      'RatingManagerNotice-savedRating-hidden',
    );

    // Hides controls.
    expect(
      screen.queryByRole('button', { name: 'Delete review' }),
    ).not.toBeInTheDocument();
  });

  it('flashes a saved rating message', () => {
    // This is dispatched via a saga, so we need to dispatch it manually.
    store.dispatch(flashReviewMessage(SAVED_RATING));
    renderWithReview();

    const flashMessage = screen.getByClassName(
      'RatingManagerNotice-savedRating',
    );
    expect(flashMessage).toHaveTextContent('Star rating saved');
    expect(flashMessage).toHaveClass('Notice-success');
    expect(flashMessage).not.toHaveClass(
      'RatingManagerNotice-savedRating-hidden',
    );

    // Hides controls.
    expect(
      screen.queryByRole('button', { name: 'Delete review' }),
    ).not.toBeInTheDocument();
  });

  it('hides a flashed rating message', () => {
    // This is dispatched via a saga, so we need to dispatch it manually.
    // Set a message then hide it.
    store.dispatch(flashReviewMessage(SAVED_RATING));
    store.dispatch(hideFlashedReviewMessage());

    renderWithReview();

    expect(
      screen.getByClassName('RatingManagerNotice-savedRating'),
    ).toHaveClass('RatingManagerNotice-savedRating-hidden');

    // Shows controls.
    expect(
      screen.getByRole('button', { name: 'Delete review' }),
    ).toBeInTheDocument();
  });

  it('sets a custom className for RatingManagerNotice when a review exists', () => {
    renderWithReview();

    expect(
      screen.getByClassName('RatingManagerNotice-savedRating'),
    ).toHaveClass('RatingManager-savedRating-withReview');
  });

  it('does not set a custom className for RatingManagerNotice when no review exists', () => {
    render();

    expect(
      screen.getByClassName('RatingManagerNotice-savedRating'),
    ).not.toHaveClass('RatingManager-savedRating-withReview');
  });

  describe('when user is signed out', () => {
    it('does not fetchLatestUserReview without a user', () => {
      const dispatch = jest.spyOn(store, 'dispatch');
      renderWithReview({ signIn: false });

      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: FETCH_LATEST_USER_REVIEW }),
      );
    });

    it.each([
      [ADDON_TYPE_DICT, 'dictionary'],
      [ADDON_TYPE_EXTENSION, 'extension'],
      [ADDON_TYPE_LANG, 'language pack'],
      [ADDON_TYPE_STATIC_THEME, 'theme'],
      // See: https://github.com/mozilla/addons-frontend/issues/3601.
      ['xul', 'add-on'],
      // This simulates a future code change where a valid type is added
      // but we haven't given it a custom prompt yet.
      ['banana', 'add-on'],
    ])('renders a login prompt for a %s', (type, prompt) => {
      mockValidAddonTypesGetter.mockReturnValue(['banana']);
      const addon = createInternalAddonWithLang({ ...fakeAddon, type });
      renderWithReview({ addon, signIn: false });

      expect(
        screen.getByRole('link', { name: `Log in to rate this ${prompt}` }),
      ).toBeInTheDocument();
    });
  });

  describe('inline features', () => {
    it('allows a user to delete a review', async () => {
      renderWithReview();

      await userEvent.click(
        screen.getByRole('button', { name: 'Delete review' }),
      );

      expect(
        screen.getByTextAcrossTags(
          `Are you sure you want to delete your review of ${defaultAddonName}?`,
        ),
      ).toBeInTheDocument();

      // This verifies that AddonReviewManagerRating receives the expected
      // rating from RatingManager.
      expect(screen.getAllByTitle('Rated 3 out of 5')).toHaveLength(6);

      await userEvent.click(
        screen.getByRole('button', { name: 'Delete review' }),
      );

      // This verifies that AddonReviewManagerRating receives the expected
      // rating from RatingManager while a deletion is happening.
      expect(screen.getAllByTitle('Rated 3 out of 5')).toHaveLength(6);
    });

    it('prompts to delete a rating when beginningToDeleteReview', async () => {
      renderWithReview({
        review: {
          ...fakeReview,
          body: undefined,
          user: { ...fakeReview.user, id: defaultUserId },
        },
      });

      await userEvent.click(
        screen.getByRole('button', { name: 'Delete rating' }),
      );

      expect(
        screen.getByTextAcrossTags(
          `Are you sure you want to delete your rating of ${defaultAddonName}?`,
        ),
      ).toBeInTheDocument();
    });

    it('still prompts to delete a review while deletingReview', async () => {
      renderWithReview();

      await userEvent.click(
        screen.getByRole('button', { name: 'Delete review' }),
      );

      expect(
        screen.getByTextAcrossTags(
          `Are you sure you want to delete your review of ${defaultAddonName}?`,
        ),
      ).toBeInTheDocument();
    });

    it('shows AddonReviewCard with a saved review', () => {
      const body = 'This is some review copy';
      renderWithReview({ review: { ...fakeReview, body } });

      expect(screen.getByText(body)).toBeInTheDocument();
    });

    it('shows and hides UserRating and prompt based on editing status', async () => {
      renderWithReview();

      expect(screen.getByClassName('RatingManager-legend')).toBeInTheDocument();
      expect(
        screen.getByClassName('RatingManager-UserRating'),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole('link', { name: 'Edit review' }));

      expect(
        screen.queryByClassName('RatingManager-legend'),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByClassName('RatingManager-UserRating'),
      ).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.getByClassName('RatingManager-legend')).toBeInTheDocument();
      expect(
        screen.getByClassName('RatingManager-UserRating'),
      ).toBeInTheDocument();
    });

    it('submits a new rating', async () => {
      const dispatch = jest.spyOn(store, 'dispatch');
      const { addon } = renderWithReview({ review: null });

      await userEvent.click(screen.getByTitle('Rate this add-on 1 out of 5'));

      expect(dispatch).toHaveBeenCalledWith(
        createAddonReview({
          addonId: addon.id,
          errorHandlerId,
          score: 1,
          versionId: fakeVersion.id,
        }),
      );
    });

    it('updates an existing rating', async () => {
      const dispatch = jest.spyOn(store, 'dispatch');
      const { review } = renderWithReview();

      await userEvent.click(
        screen.getByRole('button', {
          name: 'Update your rating to 1 out of 5',
        }),
      );

      expect(dispatch).toHaveBeenCalledWith(
        updateAddonReview({
          errorHandlerId,
          score: 1,
          reviewId: review.id,
        }),
      );
    });
  });

  describe('Tests for UserRating', () => {
    it('renders a Rating', () => {
      renderWithReview({
        review: { ...fakeReview, score: 2 },
      });

      const rating = screen.getByClassName('Rating');
      expect(rating).toHaveClass('RatingManager-UserRating');
      expect(rating).toHaveClass('Rating--large');
      expect(rating).toHaveClass('Rating--editable');
      expect(screen.getByTitle('Rated 2 out of 5')).toBeInTheDocument();
    });

    it('passes a null review to Rating', () => {
      dispatchSignInActionsWithStore({ store, userId: defaultUserId });
      // This ensures that we are rendering UserRating with a null review.
      store.dispatch(
        setLatestReview({
          addonId: defaultAddonId,
          review: null,
          userId: defaultUserId,
        }),
      );
      render();

      // We expect this prompt in Rating when review is null.
      expect(
        screen.getByTextAcrossTags('Rate this add-on 1 out of 5'),
      ).toBeInTheDocument();
      // With a null review we should not be in a loading state.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('passes an undefined review to Rating', () => {
      dispatchSignInActionsWithStore({ store, userId: defaultUserId });
      // Rendering without dispatching setLatestReview gives us a review of
      // undefined.
      render();

      // We expect this prompt in Rating when review is undefined.
      expect(
        screen.getByTextAcrossTags('Rate this add-on 1 out of 5'),
      ).toBeInTheDocument();
      // With a null review we should not be in a loading state.
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Tests for AddonReviewManagerRating', () => {
    it('lets you specify className', async () => {
      renderWithReview();

      // The AddonReviewManagerRating is only rendered when the "Delete review"
      // dialog is open, and it is assigned a custom className by
      // RatingManager.
      await userEvent.click(
        screen.getByRole('button', { name: 'Delete review' }),
      );

      expect(screen.getByClassName('AddonReviewManagerRating')).toHaveClass(
        'RatingManager-AddonReviewManagerRating',
      );
    });

    it('sets readOnly correctly when onSelectRating is undefined', async () => {
      renderWithReview();

      await userEvent.click(
        screen.getByRole('button', { name: 'Delete review' }),
      );

      // When Rating is in readOnly mode, the title for all stars is as below.
      expect(screen.getAllByTitle('Rated 3 out of 5')).toHaveLength(6);
    });
  });

  it('renders RatingsByStar with an add-on', () => {
    const addon = fakeAddon;
    render({ addon });

    // Do a sanity check to make sure the right add-on was used.
    expect(screen.getByTitle('There are no five-star reviews')).toHaveAttribute(
      'href',
      `/en-US/android/addon/${addon.slug}/reviews/?score=5`,
    );
  });
});
