/**
 * Copyright 2018 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {CONSENT_POLICY_STATE} from '../../../../src/consent-state';
import {ConsentConfig, expandPolicyConfig} from '../consent-config';
import {GEO_IN_GROUP} from '../../../amp-geo/0.1/amp-geo-in-group';
import {Services} from '../../../../src/services';
import {dict} from '../../../../src/utils/object';
import {toggleExperiment} from '../../../../src/experiments';

describes.realWin('ConsentConfig', {amp: 1}, env => {
  let win;
  let doc;
  let element;
  let defaultConfig;
  beforeEach(() => {
    win = env.win;
    doc = env.win.document;
    element = doc.createElement('div');
    toggleExperiment(win, 'amp-consent-v2', true);
    defaultConfig = dict({
      'consentInstanceId': 'ABC',
      'checkConsentHref': 'https://response1',
    });
  });

  function appendConfigScriptElement(doc, element, config) {
    const scriptElement = doc.createElement('script');
    scriptElement.setAttribute('type', 'application/json');
    scriptElement.textContent = JSON.stringify(config);
    element.appendChild(scriptElement);
  }

  describe('read consent config', () => {
    it('read inline config', () => {
      appendConfigScriptElement(doc, element, defaultConfig);
      const consentConfig = new ConsentConfig(element);
      return expect(
        consentConfig.getConsentConfigPromise()
      ).to.eventually.deep.equal(
        dict({
          'consentInstanceId': 'ABC',
          'checkConsentHref': 'https://response1',
        })
      );
    });

    it('read cmp config', () => {
      appendConfigScriptElement(doc, element, dict({}));
      element.setAttribute('type', '_ping_');
      const consentConfig = new ConsentConfig(element);
      return expect(
        consentConfig.getConsentConfigPromise()
      ).to.eventually.deep.equal(
        dict({
          'consentInstanceId': '_ping_',
          'checkConsentHref': '/get-consent-v1',
          'promptUISrc': '/test/manual/diy-consent.html',
        })
      );
    });

    it('support deprecated config format', () => {
      appendConfigScriptElement(
        doc,
        element,
        dict({
          'consents': {
            'ABC': {
              'promptIfUnknownForGeoGroup': 'eea',
              'checkConsentHref': '/href',
              'clientConfig': {
                'test': 'error',
              },
            },
          },
          'clientConfig': {
            'test': 'ABC',
          },
          'uiConfig': {
            'overlay': true,
          },
          'postPromptUI': 'test',
        })
      );
      const consentConfig = new ConsentConfig(element);
      return expect(
        consentConfig.getConsentConfigPromise()
      ).to.eventually.deep.equal(
        dict({
          'consentInstanceId': 'ABC',
          'promptIfUnknownForGeoGroup': 'eea',
          'checkConsentHref': '/href',
          'clientConfig': {
            'test': 'ABC',
          },
          'uiConfig': {
            'overlay': true,
          },
          'postPromptUI': 'test',
        })
      );
    });

    it('merge inline config w/ cmp config', () => {
      appendConfigScriptElement(
        doc,
        element,
        dict({
          'consentInstanceId': '_ping_',
          'promptIfUnknownForGeoGroup': 'eea',
          'checkConsentHref': '/override',
          'clientConfig': {
            'test': 'ABC',
          },
          'uiConfig': {
            'overlay': true,
          },
          'policy': {
            'default': {
              'waitFor': {},
            },
          },
          'postPromptUI': 'test',
        })
      );
      element.setAttribute('type', '_ping_');
      const consentConfig = new ConsentConfig(element);
      return expect(
        consentConfig.getConsentConfigPromise()
      ).to.eventually.deep.equal(
        dict({
          'consentInstanceId': '_ping_',
          'checkConsentHref': '/override',
          'promptUISrc': '/test/manual/diy-consent.html',
          'promptIfUnknownForGeoGroup': 'eea',
          'postPromptUI': 'test',
          'clientConfig': {
            'test': 'ABC',
          },
          'uiConfig': {
            'overlay': true,
          },
          'policy': {
            'default': {
              'waitFor': {},
            },
          },
        })
      );
    });

    describe('geoOverride config', () => {
      let geoConfig;
      beforeEach(() => {
        geoConfig = {
          'consentInstanceId': 'abc',
          'consentRequired': false,
          'checkConsentHref': '/override',
          'geoOverride': {
            'nafta': {
              'consentRequired': true,
            },
            'waldo': {
              'checkConsentHref': 'https://example.com/check-consent',
              'consentRequired': 'remote',
            },
            'geoGroupUnknown': {
              'checkConsentHref': 'https://example.com/check-consent',
              'consentRequired': true,
            },
          },
        };
      });

      it('should return the original config if no geo matches', async () => {
        appendConfigScriptElement(doc, element, geoConfig);
        env.sandbox.stub(Services, 'geoForDocOrNull').returns(
          Promise.resolve({
            isInCountryGroup() {
              return false;
            },
          })
        );

        const consentConfig = new ConsentConfig(element);
        return expect(
          consentConfig.getConsentConfigPromise()
        ).to.eventually.deep.equal({
          'consentInstanceId': 'abc',
          'consentRequired': false,
          'checkConsentHref': '/override',
        });
      });

      it('should work with single field override', async () => {
        appendConfigScriptElement(doc, element, geoConfig);
        env.sandbox.stub(Services, 'geoForDocOrNull').returns(
          Promise.resolve({
            isInCountryGroup(geoGroup) {
              if (geoGroup === 'nafta') {
                return GEO_IN_GROUP.IN;
              }
              return GEO_IN_GROUP.NOT_IN;
            },
          })
        );

        const consentConfig = new ConsentConfig(element);
        expect(await consentConfig.getConsentConfigPromise()).to.deep.equal({
          'consentInstanceId': 'abc',
          'consentRequired': true,
          'checkConsentHref': '/override',
        });
      });

      it('should work with multiple fields override', async () => {
        appendConfigScriptElement(doc, element, geoConfig);
        env.sandbox.stub(Services, 'geoForDocOrNull').returns(
          Promise.resolve({
            isInCountryGroup(geoGroup) {
              if (geoGroup === 'waldo') {
                return GEO_IN_GROUP.IN;
              }
              return GEO_IN_GROUP.NOT_IN;
            },
          })
        );

        const consentConfig = new ConsentConfig(element);
        expect(await consentConfig.getConsentConfigPromise()).to.deep.equal({
          'consentInstanceId': 'abc',
          'checkConsentHref': 'https://example.com/check-consent',
          'consentRequired': 'remote',
        });
      });

      it('should override undefined fields', async () => {
        geoConfig = {
          'consentInstanceId': 'abc',
          'geoOverride': {
            'geoGroupUnknown': {
              'checkConsentHref': 'https://example.com/check-consent',
              'consentRequired': true,
            },
          },
        };
        appendConfigScriptElement(doc, element, geoConfig);
        env.sandbox.stub(Services, 'geoForDocOrNull').returns(
          Promise.resolve({
            isInCountryGroup(geoGroup) {
              if (geoGroup === 'geoGroupUnknown') {
                return GEO_IN_GROUP.IN;
              }
              return GEO_IN_GROUP.NOT_IN;
            },
          })
        );

        const consentConfig = new ConsentConfig(element);
        expect(await consentConfig.getConsentConfigPromise()).to.deep.equal({
          'consentInstanceId': 'abc',
          'checkConsentHref': 'https://example.com/check-consent',
          'consentRequired': true,
        });
      });
    });

    it('assert valid config', async () => {
      const scriptTypeError =
        'amp-consent/consent-config: <script> child ' +
        'must have type="application/json"';
      const consentExistError =
        'amp-consent/consent-config: ' +
        'consentInstanceId to store consent info is required';
      const multiScriptError =
        'amp-consent/consent-config: Found 2 <script> children. Expected 1';
      const invalidJsonError =
        'amp-consent/consent-config: ' +
        'Failed to parse <script> contents. Is it valid JSON?';
      const invalidCMPError = 'amp-consent/consent-config: invalid CMP type';
      const multiConsentError =
        'amp-consent/consent-config: ' +
        'only single consent instance is supported';
      const checkConsentHrefError =
        'amp-consent/consent-config: ' +
        '`checkConsentHref` must be specified if `consentRequired` is remote';

      env.sandbox.stub(Services, 'geoForDocOrNull').returns(
        Promise.resolve({
          isInCountryGroup() {
            return false;
          },
        })
      );

      const scriptElement = doc.createElement('script');
      scriptElement.textContent = JSON.stringify(defaultConfig);
      scriptElement.setAttribute('type', '');
      element.appendChild(scriptElement);

      const config = new ConsentConfig(element);
      expect(() => config.getConsentConfigPromise()).to.throw(scriptTypeError);

      // Check consent config exists
      scriptElement.setAttribute('type', 'application/json');
      scriptElement.textContent = JSON.stringify({});
      allowConsoleError(() => {
        expect(() =>
          new ConsentConfig(element).getConsentConfigPromise()
        ).to.throw(consentExistError);
      });

      scriptElement.textContent = JSON.stringify({
        'consents': {
          'ABC': {},
          'DEF': {},
        },
      });
      allowConsoleError(() => {
        expect(() =>
          new ConsentConfig(element).getConsentConfigPromise()
        ).to.throw(multiConsentError);
      });

      scriptElement.textContent = JSON.stringify({
        'consentInstanceId': 'abc',
        'geoOverride': {},
        'consentRequired': 'remote',
      });
      await expect(
        new ConsentConfig(element).getConsentConfigPromise()
      ).to.be.rejectedWith(checkConsentHrefError);

      // Check invalid CMP
      scriptElement.textContent = JSON.stringify({
        'clientConfig': 'test',
      });
      element.setAttribute('type', 'not_exist');
      allowConsoleError(() => {
        expect(() =>
          new ConsentConfig(element).getConsentConfigPromise()
        ).to.throw(invalidCMPError);
      });

      scriptElement.textContent = '"abc": {"a",}';
      expect(() =>
        new ConsentConfig(element).getConsentConfigPromise()
      ).to.throw(invalidJsonError);

      // Check there is only one script object
      scriptElement.textContent = JSON.stringify(defaultConfig);
      const script2 = doc.createElement('script');
      element.appendChild(script2);
      expect(() =>
        new ConsentConfig(element).getConsentConfigPromise()
      ).to.throw(multiScriptError);
    });

    it('remove not supported policy', () => {
      toggleExperiment(win, 'multi-consent', false);
      appendConfigScriptElement(
        doc,
        element,
        dict({
          'consentInstanceId': 'ABC',
          'policy': {
            'ABC': undefined,
          },
        })
      );
      const consentConfig = new ConsentConfig(element);
      return expect(
        consentConfig.getConsentConfigPromise()
      ).to.eventually.deep.equal({
        'consentInstanceId': 'ABC',
        'policy': {},
      });
    });
  });

  describe('expandPolicyConfig', () => {
    it('create default policy', () => {
      const policy = expandPolicyConfig(dict({}), 'ABC');
      expect(policy['default']).to.deep.equal({
        'waitFor': {
          'ABC': undefined,
        },
      });
    });

    it('create predefined _till_responded policy', function*() {
      const policy = expandPolicyConfig(dict({}), 'ABC');
      expect(policy['_till_responded']).to.deep.equal({
        'waitFor': {
          'ABC': undefined,
        },
        'unblockOn': [
          CONSENT_POLICY_STATE.UNKNOWN,
          CONSENT_POLICY_STATE.SUFFICIENT,
          CONSENT_POLICY_STATE.INSUFFICIENT,
          CONSENT_POLICY_STATE.UNKNOWN_NOT_REQUIRED,
        ],
      });
    });

    it('create predefined _till_accepted policy', function*() {
      const policy = expandPolicyConfig(dict({}), 'ABC');
      expect(policy['_till_accepted']).to.deep.equal({
        'waitFor': {
          'ABC': undefined,
        },
      });
    });

    it('create default _auto_reject policy', function*() {
      const policy = expandPolicyConfig(dict({}), 'ABC');
      expect(policy['_auto_reject']).to.deep.equal({
        'waitFor': {
          'ABC': undefined,
        },
        'timeout': {
          'seconds': 0,
          'fallbackAction': 'reject',
        },
        'unblockOn': [
          CONSENT_POLICY_STATE.UNKNOWN,
          CONSENT_POLICY_STATE.SUFFICIENT,
          CONSENT_POLICY_STATE.INSUFFICIENT,
          CONSENT_POLICY_STATE.UNKNOWN_NOT_REQUIRED,
        ],
      });
    });

    it('override default policy', function*() {
      const policy = expandPolicyConfig(
        dict({
          'default': {
            'waitFor': {
              'ABC': [],
            },
            'timeout': 2,
          },
        }),
        'ABC'
      );
      expect(policy['default']).to.deep.equal({
        'waitFor': {
          'ABC': [],
        },
        'timeout': 2,
      });
      expect(policy['_till_accepted']).to.deep.equal({
        'waitFor': {
          'ABC': undefined,
        },
      });
    });
  });
});
