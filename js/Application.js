/*
 Copyright 2020 Esri

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */

import AppBase from "./support/AppBase.js";
import AppLoader from "./loaders/AppLoader.js";

class Application extends AppBase {

  // PORTAL //
  portal;

  constructor() {
    super();

    // LOAD APPLICATION BASE //
    super.load().then(() => {

      // APPLICATION LOADER //
      const applicationLoader = new AppLoader({app: this});
      applicationLoader.load().then(({portal, group, map, view}) => {
        //console.info(portal, group, map, view);

        // PORTAL //
        this.portal = portal;

        // APP TITLE //
        this.title = this.title || map?.portalItem?.title || 'Application';
        // APP DESCRIPTION //
        this.description = this.description || map?.portalItem?.description || group?.description || '...';

        // USER SIGN-IN //
        this.configUserSignIn();

        // APPLICATION //
        this.applicationReady({portal, group, map, view}).catch(this.displayError).then(() => {
          // HIDE APP LOADER //
          document.getElementById('app-loader').removeAttribute('active');
        });

      }).catch(this.displayError);
    }).catch(this.displayError);

  }

  /**
   *
   */
  configUserSignIn() {
    if (this.oauthappid || this.portal?.user) {

      const signIn = document.getElementById('sign-in');
      signIn && (signIn.portal = this.portal);

    }
  }

  /**
   *
   * @param view
   */
  configView(view) {
    return new Promise((resolve, reject) => {
      if (view) {
        require([
          'esri/widgets/Home',
          'esri/widgets/Legend'
        ], (Home, Legend) => {

          // if (!Boolean(this.interactive)) {
          //   view.container.classList.add('no-interaction');
          // }

          //
          // CONFIGURE VIEW SPECIFIC STUFF HERE //
          //
          view.set({
            qualityProfile: "low"  // "low"|"medium"|"high"
          });

          // HOME //
          const home = new Home({view});
          view.ui.add(home, {position: 'top-left', index: 0});

          // LEGEND //
          const legend = new Legend({view});
          view.ui.add(legend, {position: 'top-right', index: 0});

          // VIEW UPDATING //
          this.disableViewUpdating = true;
          const viewUpdating = document.getElementById('view-updating');
          view.ui.add(viewUpdating, 'bottom-right');
          this._watchUtils.init(view, 'updating', updating => {
            (!this.disableViewUpdating) && viewUpdating.toggleAttribute('active', updating);
          });

          resolve();
        });
      } else { resolve(); }
    });
  }

  /**
   *
   * @returns {Promise<>}
   */

  /*loadProjectionEngine() {
   return new Promise((resolve, reject) => {
   require(["esri/geometry/projection"], (projection) => {
   projection.load().then(resolve).catch(reject);
   });
   });
   }*/

  /**
   *
   * @param portal
   * @param group
   * @param map
   * @param view
   * @returns {Promise}
   */
  applicationReady({portal, group, map, view}) {
    return new Promise(async (resolve, reject) => {
      // VIEW READY //
      this.configView(view).then(() => {

        this.initializeViewSpinTools({view});
        this.initializeSlideTiles({view}).then(resolve).catch(reject);

        //this.initializeVoxelFilters({view});

      }).catch(reject);
    });
  }

  /**
   *
   * @param view
   */
  initializeSlideTiles({view}) {
    return new Promise((resolve, reject) => {

      const slideTileTemplate = document.getElementById('slide-tile-template');
      const createSlideTile = (slide, slideIdx) => {
        const templateNode = slideTileTemplate.content.cloneNode(true);
        const slideTile = templateNode.querySelector('calcite-tile-select');
        slideTile.setAttribute('heading', slide.title.text);
        slideTile.setAttribute('description', " "); // blank space critical to maintain vertical layout //
        slideTile.setAttribute('value', slideIdx);
        slideTile.toggleAttribute('checked', (slideIdx === 0));

        const slideThumb = templateNode.querySelector('.slide-thumb');
        slideThumb.setAttribute('src', slide.thumbnail.url);

        slideTile.addEventListener('calciteTileSelectChange', () => {
          setActiveSlide(slideIdx);
        });
        return slideTile;
      };

      const slides = view.map.presentation.slides;
      const slideTiles = slides.map(createSlideTile);

      const slideTileContainer = document.getElementById('slide-tile-container');
      slideTileContainer.replaceChildren(...slideTiles);

      setTimeout(() => {
        slideTileContainer.querySelectorAll('calcite-tile-select').forEach(tileSelect => {
          this.setShadowElementStyle(tileSelect, '.container.width-full', 'flex-direction', 'column');
        });
      }, 500);

      const setActiveSlide = (slideIdx) => {
        const nextSlideItem = slideTileContainer.querySelector(`calcite-tile-select[value="${ slideIdx }"]`);
        nextSlideItem.toggleAttribute('checked', true);
        slides.getItemAt(slideIdx).applyTo(view);
      };

      const updateProgress = document.getElementById('update-progress');
      const _updateProgress = () => {
        updateProgress.value -= 0.001;
      };

      const _nextSlide = () => {
        updateProgress.value = 1.0;
        const currentSlideItem = slideTileContainer.querySelector('calcite-tile-select[checked]');
        const currentSlideIdx = +currentSlideItem.getAttribute('value');
        let nextSlideIdx = (currentSlideIdx + 1);
        if (nextSlideIdx > (slides.length - 1)) { nextSlideIdx = 0; }
        setActiveSlide(nextSlideIdx);
      };

      let updateHandle;
      let progressHandle;
      const slidesAction = document.getElementById('slides-action');
      slidesAction.addEventListener('click', () => {
        const isActive = slidesAction.toggleAttribute('active');
        slideTileContainer.toggleAttribute('disabled', isActive);

        if (isActive) {
          slidesAction.setAttribute('icon', 'pause-f');
          updateProgress.value = 1.0;
          updateHandle = setInterval(_nextSlide, 10000);
          progressHandle = setInterval(_updateProgress, 10);
          view.focus();
        } else {
          slidesAction.setAttribute('icon', 'play-f');
          updateProgress.value = 0.0;
          updateHandle && clearInterval(updateHandle);
          updateHandle = null;
          progressHandle && clearInterval(progressHandle);
          progressHandle = null;
        }
      });

      resolve();
    });
  }

  /**
   *
   * @param view
   */
  initializeViewSpinTools({view}) {
    require([
      'esri/core/watchUtils',
      'esri/core/promiseUtils'
    ], (watchUtils, promiseUtils) => {

      const viewSpinPanel = document.getElementById("view-spin-panel");
      view.ui.add(viewSpinPanel);

      // DISPLAY SPIN TOOLS //
      viewSpinPanel.removeAttribute('hidden');

      let spin_direction = "none";
      let spin_step = 0.05;

      const _spin = promiseUtils.debounce(() => {
        if (spin_direction !== "none") {
          const heading = (view.camera.heading + ((spin_direction === "right") ? spin_step : -spin_step));
          view.goTo({
            center: view.center.clone(),
            heading: heading
          }, {animate: false}).then(() => {
            if (spin_direction !== "none") {
              requestAnimationFrame(_spin);
            }
          });
        }
      });

      this.enableSpin = (enabled) => {
        //viewSpinPanel.classList.toggle("btn-disabled", !enabled);
        if (!enabled) {
          _enableSpin("none");
          spinLeftBtn.removeAttribute('active');
          spinRightBtn.removeAttribute('active');
        }
      };

      const _enableSpin = (direction) => {
        spin_direction = direction;
        if (spin_direction !== "none") { _spin(); }
      };

      const spinLeftBtn = document.getElementById('spin-left-btn');
      const headingNode = document.getElementById('spin-heading-label');
      const spinRightBtn = document.getElementById('spin-right-btn');

      spinLeftBtn.addEventListener("click", () => {
        spinRightBtn.setAttribute('appearance', "clear");
        _enableSpin("none");
        if (spinLeftBtn.toggleAttribute("active")) {
          _enableSpin("left");
        }
      });

      spinRightBtn.addEventListener("click", () => {
        spinLeftBtn.removeAttribute("active");
        _enableSpin("none");
        if (spinRightBtn.toggleAttribute("active")) {
          _enableSpin("right");
        }
      });

      const getHeadingLabel = heading => {
        let label = "N";
        switch (true) {
          case (heading < 67):
            label = "NE";
            break;
          case (heading < 113):
            label = "E";
            break;
          case (heading < 157):
            label = "SE";
            break;
          case (heading < 202):
            label = "S";
            break;
          case (heading < 247):
            label = "SW";
            break;
          case (heading < 292):
            label = "W";
            break;
          case (heading < 337):
            label = "NW";
            break;
        }
        return label;
      };

      watchUtils.init(view, "camera.heading", heading => {
        headingNode.innerHTML = getHeadingLabel(heading);
        headingNode.title = heading.toFixed(0);
      });

    });
  }

  /**
   *
   * To change the render mode you change vxlLayer.style.renderMode.
   *
   * The only 2 possibilities are “volume” and “surfaces”.
   *
   * The “surfaces” render mode includes isosurfaces and dynamic aka unlocked sections
   * and “volume” means drawing the full volume, what you currently call “Full Dataset”.
   *
   * Slices apply to both render modes.
   *
   * Static or locked sections draw in both render modes but you can only see them in
   * “volume” rendering if the volume is sliced to reveal the static section.
   *
   *
   * I don’t think your sample app uses different variables but if your dataset has
   * multiple variables that would be 1 way to accomplish some of the different rendering
   * that you want to highlight.  Each variable has its own “style”, which is like a renderer,
   * so you could have 1 variable show just isosurfaces in “surfaces” mode and another which
   * has both dynamic sections and isosurfaces.
   *
   * The variable can be changed using vxlLayer.style.currentVariableId.
   *
   * vxlLayer.variables exposes a collection of variables, each of which has an Id
   * that you can set as currentVariableId (i.e. they are IDs and not indices).
   *
   * We also let you change the set of slices or dynamicSections but that could be a little
   * more involved.  I can go over it with you if you want though.  We don’t currently have
   * JS support for any of the following though:
   *
   * 1)  changing the set of isosurfaces in any way
   * 2)  changing the color or opacity functions used when rendering the volume or sections
   *
   *
   * @param view
   */
  initializeVoxelFilters({view}) {

    view.map.layers.forEach(voxelLayer => {
      voxelLayer?.load().then(() => {
        voxelLayer.watch('visible', visible => {
          if (visible) {
            // “volume” and “surfaces” //
            console.info(voxelLayer.title, voxelLayer.style,  voxelLayer.style.renderMode, voxelLayer.style.currentVariableId);
          }
        });
      });
    });

  }
}

export default new Application();
