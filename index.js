const Helper = require('@codeceptjs/helper');
const pixelmatch = require('pixelmatch')
const PNG = require('pngjs').PNG;
const fs = require('fs')
const path = require('path')

class VisualTesting extends Helper {
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
     * - options.allowedMismatchedPixelsPercent (Default: 0.01)
     *
     *   This should be a float between 0.00 and 1.00 that determines how many
     *   mismatched pixels are allowed before a test fails. Typically values
     *   between 0.01 and 0.05 should be chosen. The reason we do this is because
     *   it's pretty common for browsers to render things ever so slightly differently,
     *   and we'd like to avoid those kinds of false positives.
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
        options.allowedMismatchedPixelsPercent = options.allowedMismatchedPixelsPercent ?? 0.01;
        options.preserveTexts = options.preserveTexts ?? [];
        options.hideElements = options.hideElements ?? [];

        if (!screenshotName) {
            throw new Error('You must pass a unique identifier to `I.dontSeeChanges`.');
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
        const baseBaseIgnoredTexts = await this._getBaseIgnoredTexts(screenshotName);
        const originalTexts = await this._getIgnoredTexts(options);

        await this._setIgnoredTexts(options, baseBaseIgnoredTexts);
        await this._setHiddenElements(options, true);

        const screenshotBuffer = await this._captureScreen();

        await this._setIgnoredTexts(options, originalTexts);
        await this._setHiddenElements(options, false);

        return screenshotBuffer;
    }

    _assertImagesSimilar(
        newImageBuffer,
        screenshotName,
        allowedMismatchedPixelsPercent
    ) {
        const baseImagePath = this._getBaseImagePath(screenshotName);
        const baseImageBuffer = fs.readFileSync(baseImagePath);
        const diffImagePath = this._getBaseDiffPath(screenshotName);

        if (!fs.existsSync(baseImagePath)) {
            throw new Error(`Couldn't find base image in '${baseImagePath}'.`);
        }

        // Create the diff folder if it doesn't exist already.
        if (!fs.existsSync(this.config.diffFolder)) {
            fs.mkdirSync(this.config.diffFolder);
        }

        const results = this._compareImages(baseImageBuffer, newImageBuffer);
        if (results.mismatchedPixelsPercent > allowedMismatchedPixelsPercent) {
            const newFailedImagePath = this._getNewFailedImagePath(screenshotName);

            this.debug(`Creating/Updating diff image: ${diffImagePath}.`);
            fs.writeFileSync(diffImagePath, results.pngDiffBuffer);
            this.debug(`Creating/Updating new failed image: ${diffImagePath}.`);
            fs.writeFileSync(newFailedImagePath, newImageBuffer);

            throw new Error(
                `It looks like ${screenshotName} has visually changed! ` +
                `${(results.mismatchedPixelsPercent * 100).toFixed(2)}% ` +
                `of pixels were changed with a max of ` +
                `${(allowedMismatchedPixelsPercent * 100).toFixed(2)}% allowed. ` +
                `Take a look at the following file to see what changed: ${diffImagePath}.`
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
        return path.resolve(global.codecept_dir,
            path.join(this.config.baseFolder, `${screenshotName}.png`));
    }

    _getBaseIgnoredTextsPath(screenshotName) {
        return path.resolve(global.codecept_dir,
            path.join(this.config.baseFolder, `${screenshotName}_dom.json`));
    }

    _getBaseDiffPath(screenshotName) {
        return path.resolve(global.codecept_dir,
            path.join(this.config.diffFolder, `${screenshotName}_diff.png`));
    }

    _getNewFailedImagePath(screenshotName) {
        return path.resolve(global.codecept_dir,
            path.join(this.config.diffFolder, `${screenshotName}_failed.png`));
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
        return this.helpers['WebDriver'].saveScreenshot('visual_temp.png')
    }

    _getIgnoredTexts(options) {
        return this.helpers['WebDriver'].executeScript((options) => {
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
        return this.helpers['WebDriver'].executeScript((options, ignoredTexts) => {
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
                console.log(
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
        return this.helpers['WebDriver'].executeScript((options, hidden) => {
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
                    console.log('hiding stuff...')
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
