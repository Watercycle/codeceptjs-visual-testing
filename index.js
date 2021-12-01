const Helper = require('@codeceptjs/helper');
const pixelmatch = require('pixelmatch')
const PNG = require('pngjs').PNG;
const fs = require('fs');
const path = require('path');
const assert = require('assert');

class VisualTesting extends Helper {
    parsedConfig = {};

    get driver() {
        const driver = this.helpers.Puppeteer ?? this.helpers.WebDriver;

        if (!driver) {
            console.warn('(VisualTestingHelper) Unsupported driver detected. ' +
                'Please open an issue to add explicit support!');
        }

        return driver;
    }

    constructor(config) {
        super(config)

        this.parsedConfig = {
            imageFolder: path.resolve(global.codecept_dir, config.baseFolder),
            diffFolder: path.resolve(global.codecept_dir, config.diffFolder)
        }
    }

    /**
     * This function allows you to do visual regression testing while offering
     * a convenient way to automatically update tests.
     *
     * To update all (or some) visual regression tests, run
     *
     * ```
     * UPDATE_VISUALS=1 codeceptjs run --grep @visual
     * ```
     *
     * Allowed Options:
     *
     * - options.allowedMismatchedPixelsPercent (Default: 1)
     *
     *   This determines how many mismatched pixels are allowed before a test
     *   fails. Typically values between 1 and 5 should be chosen. The reason
     *   we do this is because it's pretty common for browsers to render things
     *   ever so slightly differently, and we'd like to avoid those kinds of
     *   false positives.
     *
     * - options.preserveTexts (Default: [])
     *
     *   When doing visual testing, a common issue is that things like dates
     *   and textual content change frequently. This option allows you to
     *   specify css selectors that should have their text content restored to
     *   what they were in the base screenshot. In doing so, the test can focus
     *   on visual changes rather than content-based ones.
     *
     *   If you'd like to apply this to the entire page, you can simply set this
     *   to ['body']. Naturally, this will break whenever the dom layout changes,
     *   but the test usually needs to be updated either way at that point.
     *
     * - options.hideElements (Default: [])
     *
     *   When doing visual testing, a common issue is that graphical elements
     *   like to appear, animate, and change at random. One solution to this is
     *   to just hide them. This option allows you to specify css selectors to
     *   elements that should be hidden (via `display: none`).
     *
     * @param screenshotName - Used to uniquely identify the screenshot used for diffing.
     * @param options { ?preserveTexts: string[], ?preserveTexts: number, ?hideElements: string[] } - See docblock.
     */
    async dontSeeVisualChanges(screenshotName, options = {}) {
        options.allowedMismatchedPixelsPercent = options.allowedMismatchedPixelsPercent ?? 1;
        options.preserveTexts = options.preserveTexts ?? [];
        options.hideElements = options.hideElements ?? [];

        if (!screenshotName) {
            assert.fail('(VisualTestingHelper) The 1st argument to ' +
                '`I.dontSeeChanges` must be a unique identifier string.');
        }

        if (process.env.UPDATE_VISUALS) {
            this.debug(`Updating base image for... ${screenshotName}.`)

            await this._storeBaseImage(screenshotName, options);
        } else {
            this.debug(`Doing visual diff for... ${screenshotName}.`);
            const newImageBuffer = await this._captureScreenAltered(screenshotName, options);

            await this._assertImagesSimilar(newImageBuffer, screenshotName,
                options.allowedMismatchedPixelsPercent);
        }
    }

    async _storeBaseImage(screenshotName, options) {
        const baseImagePath = this._getBaseImagePath(screenshotName);
        const baseImageBuffer = await this._captureScreenAltered(screenshotName, options);

        // Create the base folder if it doesn't exist already.
        if (!fs.existsSync(this.parsedConfig.imageFolder)) {
            fs.mkdirSync(this.parsedConfig.imageFolder, { recursive: true });
        }

        this.debug(`Creating/Updating base image: ${baseImagePath}.`);
        fs.writeFileSync(baseImagePath, baseImageBuffer);

        await this._updateIgnoredTexts(screenshotName, options);
    }

    async _updateIgnoredTexts(screenshotName, options) {
        const baseIgnoredTextsPath = this._getBaseIgnoredTextsPath(screenshotName);

        if (fs.existsSync(baseIgnoredTextsPath)) {
            this.debug(`Clearing out previous ${baseIgnoredTextsPath} to avoid confusion.`);
            fs.unlinkSync(baseIgnoredTextsPath);
        }

        if (options.preserveTexts.length > 0) {
            const baseIgnoredTextsPath = this._getBaseIgnoredTextsPath(screenshotName);
            const baseIgnoredTexts = JSON.stringify(await this._getIgnoredTexts(options));

            this.debug(`Creating ignored dom text: ${baseIgnoredTextsPath}.`);
            fs.writeFileSync(baseIgnoredTextsPath, baseIgnoredTexts);
        }
    }

    /**
     * In this method we...
     *
     * 1. Save the original dom
     * 2. Set the dom to our reference image's dom
     * 3. Take a screenshot
     * 4. Restore the original dom
     *
     * This is mainly used by the dontSeeVisualChanges method's preserveTexts option.
     */
    async _captureScreenAltered(screenshotName, options) {

        if (options.preserveTexts.length > 0) {
            const baseBaseIgnoredTexts = await this._getBaseIgnoredTexts(screenshotName);
            await this._setIgnoredTexts(options, baseBaseIgnoredTexts);
        }
        if (options.hideElements.length > 0) await this._setHiddenElements(options, true);

        const screenshotBuffer = await this._captureScreen();

        if (options.preserveTexts.length > 0) {
            const originalTexts = await this._getIgnoredTexts(options);
            await this._setIgnoredTexts(options, originalTexts);
        }
        if (options.hideElements.length > 0) await this._setHiddenElements(options, false);

        return screenshotBuffer;
    }

    _assertImagesSimilar(
        newImageBuffer,
        screenshotName,
        allowedMismatchedPixelsPercent
    ) {
        const baseImagePath = this._getBaseImagePath(screenshotName);
        if (!fs.existsSync(baseImagePath)) {
            assert.fail(`(VisualTestingHelper) Couldn't find a base image in '${baseImagePath}'. ` +
            `This likely means that it's a new test or the unique identifier string was changed. ` +
            `Run 'UPDATE_VISUALS=1 codeceptjs run' to establish a new baseline.`);
        }

        const baseImageBuffer = fs.readFileSync(baseImagePath);
        const diffImagePath = this._getBaseDiffPath(screenshotName);

        // Create the diff folder if it doesn't exist already.
        if (!fs.existsSync(this.parsedConfig.diffFolder)) {
            fs.mkdirSync(this.parsedConfig.diffFolder, { recursive: true });
        }

        const results = this._compareImages(baseImageBuffer, newImageBuffer);
        if (results.mismatchedPixelsPercent > (allowedMismatchedPixelsPercent / 100)) {
            this.debug(`Creating/Updating diff image: ${diffImagePath}.`);
            fs.writeFileSync(diffImagePath, results.pngDiffBuffer);

            assert.fail(
                `(VisualTestingHelper) It looks like the test '${screenshotName}' has visually changed! ` +
                `${(results.mismatchedPixelsPercent * 100).toFixed(2)}% ` +
                `of pixels were changed with a max of ` +
                `${allowedMismatchedPixelsPercent.toFixed(2)}% allowed. ` +
                `Take a look at the following file to see what changed: ${diffImagePath}. ` +
                `If the changes make sense, run 'UPDATE_VISUALS=1 codeceptjs run'.`
            );
        }
    }

    _compareImages(img1Buffer, img2Buffer) {
        const img1 = PNG.sync.read(img1Buffer);
        const img2 = PNG.sync.read(img2Buffer);
        const { width, height } = img1;
        const numPixels = width * height;
        const diffBuffer = new PNG({ width, height });
        const options = { threshold: 0.1 };

        // https://github.com/mapbox/pixelmatch
        const numMismatchedPixels = pixelmatch(img1.data, img2.data,
            diffBuffer.data, width, height, options);

        return {
            mismatchedPixelsPercent: numMismatchedPixels / numPixels,
            pngDiffBuffer: PNG.sync.write(diffBuffer)
        }
    }

    _getBaseImagePath(screenshotName) {
        return path.resolve(this.parsedConfig.imageFolder, `${screenshotName}.png`);
    }

    _getBaseIgnoredTextsPath(screenshotName) {
        return path.resolve(this.parsedConfig.imageFolder, `${screenshotName}_dom.json`);
    }

    _getBaseDiffPath(screenshotName) {
        return path.resolve(this.parsedConfig.diffFolder, `${screenshotName}.png`);
    }

    _getBaseIgnoredTexts(screenshotName) {
        const baseIgnoredTextsPath = this._getBaseIgnoredTextsPath(screenshotName);

        // There is none (i.e. first run or not using preserveTexts option)
        if (!fs.existsSync(baseIgnoredTextsPath)) {
            return [];
        }

        try {
            return JSON.parse(fs.readFileSync(baseIgnoredTextsPath).toString());
        } catch {
            this.debug(`Deleting corrupted ${baseIgnoredTextsPath} file.`);
            fs.unlinkSync(baseIgnoredTextsPath);

            return [];
        }
    }

    _captureScreen() {
        return this.driver.saveScreenshot('visual_temp.png')
    }

    _getIgnoredTexts(options) {
        return this.driver.executeScript((options) => {
            // NOTE: Keep this in sync with setIgnoredTexts
            function getTextNodesUnderElement(node) {
                let textNodes = [];

                for (node = node.firstChild; node; node = node.nextSibling) {
                    if (node.nodeType === 3) {
                        textNodes.push(node);
                    } else {
                        textNodes = textNodes.concat(getTextNodesUnderElement(node));
                    }
                }

                return textNodes;
            }

            const uberCssSelector = options.preserveTexts.join(',');
            const targetNodes = Array.from(document.querySelectorAll(uberCssSelector));
            const textNodes = [].concat(...targetNodes.map((node) => getTextNodesUnderElement(node)));

            // -------------------- Unique Code Below --------------------------

            return textNodes.map((node) => node.textContent);
        }, options);
    }

    _setIgnoredTexts(options, ignoredTexts) {
        return this.driver.executeScript((options, ignoredTexts) => {
            // NOTE: Keep this in sync with getIgnoredTexts
            function getTextNodesUnderElement(node) {
                let textNodes = [];

                for (node = node.firstChild; node; node = node.nextSibling) {
                    if (node.nodeType === 3) {
                        textNodes.push(node);
                    } else {
                        textNodes = textNodes.concat(getTextNodesUnderElement(node));
                    }
                }

                return textNodes;
            }

            const uberCssSelector = options.preserveTexts.join(',');
            const targetNodes = Array.from(document.querySelectorAll(uberCssSelector));
            const textNodes = [].concat(...targetNodes.map((node) => getTextNodesUnderElement(node)));

            // -------------------- Unique Code Below --------------------------

            // If these don't match, that likely means the test data or
            // dom structure has changed. In that case, the test is basically
            // guaranteed to fail and need to be updated.
            if (ignoredTexts.length !== textNodes.length) {
                console.warn(
                    'The ActorAdvancedE2E helper did *not* substitute in the given ' +
                    `text elements because ${ignoredTexts.length} texts were provided and ` +
                    `${textNodes.length} texts were detected. This means you will ` +
                    'probably have to update the relevant visual test.'
                );

                return;
            }

            // Do the substitutions.
            for (let i = 0; i < textNodes.length; i++) {
                textNodes[i].textContent = ignoredTexts[i];
            }
        }, options, ignoredTexts);
    }

    _setHiddenElements(options, hidden) {
        return this.driver.executeScript((options, hidden) => {
            function createDynamicCss(css) {
                const style = document.createElement('style');
                style.id = 'e2e-visual-testing-global-styles'
                style.type = 'text/css';
                style.innerHTML = css;

                document.getElementsByTagName('head')[0].appendChild(style);
            }

            if (hidden) {
                // Make 'e2e-visual-testing-hidden' a valid global style. This won't
                // work with shadow dom elements, but is more reliable and safer than
                // manually setting display properties inline on elements for the purpose
                // of restoring the previous value.
                createDynamicCss('.e2e-visual-testing-hidden { display: none; }');


                const uberCssSelector = options.hideElements.join(',');
                const hiddenNodes = document.querySelectorAll(uberCssSelector);

                hiddenNodes.forEach((node) => {
                    node.classList.toggle('e2e-visual-testing-hidden', hidden)
                });
            } else {
                // Remove the global style
                const testStyles = document.getElementById('e2e-visual-testing-global-styles');
                if (testStyles) {
                    testStyles.remove();
                }

                // Remove the child styles
                const hiddenNodes = document.querySelectorAll('.e2e-visual-testing-hidden');
                hiddenNodes.forEach((node) => {
                    node.classList.remove('e2e-visual-testing-hidden')
                });
            }
        }, options, hidden);
    }
}

module.exports = VisualTesting;
