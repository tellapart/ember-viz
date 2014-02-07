(function() {
  Ember.EmberViz = Ember.Namespace.create();
})();

(function() {
  Ember.EmberViz.Helpers = Ember.Namespace.create({
    getDomain: function(seriesArray, accessFunction) {
      var enabledSeries = seriesArray.rejectBy('disabled');
      var minValue = d3.min(enabledSeries,
                        function(d) {
                          return d3.min(d.values, accessFunction);
                        }),
          maxValue = d3.max(enabledSeries,
                        function(d) {
                          return d3.max(d.values, accessFunction);
                        });
      return [minValue, maxValue];
    },
    overrideDomain: function(range, newRange, includeZero) {
      if (newRange !== undefined && newRange !== null) {
        if (!isNaN(newRange[0])) {
          range[0] = newRange[0];
        }
        if (!isNaN(newRange[1])) {
          range[1] = newRange[1];
        }
      }
      if (includeZero) {
        if (range[0] < 0 && range[1] < 0) {
          range[1] = 0;
        }
        if (range[0] > 0 && range[1] > 0) {
          range[0] = 0;
        }
      }
      return range;
    },
    arePointsEqual: function(p1, p2) {
      return p1 && p2 && p1.x === p2.x && p1.y === p2.y;
    }
  });
})();

(function() {
  var MILLISECONDS_IN_DAY = 86400000;
  var MILLISECONDS_IN_MINUTE = 60000;
  var SEE_DOCUMENTATION_MSG = 'See https://github.com/tellapart/ember-viz for' +
    ' EmberViz usage details.';

  /*
   * Basic chart view to display a chart with no tools to manipulate the graph
   * other than a legend.
   */
  Ember.EmberViz.LineChartComponent = Ember.Component.extend({

    /***************************************************************************
     * Public variables that can be overwritten.
     **************************************************************************/

    initialize: function() {
      this.applyUserOptions();
    }.on('init'),

    classNames: ['ev-line-chart'],

    // Default options. User can override any or all of them by setting an
    // 'options' attribute upon component creation.
    tooltipSearchRadius: 10,
    margins: {top: 20, right: 20, bottom: 30, left: 50},
    legendMargins: {top: 0, right: 50, bottom: 0, left: 50},
    forceY: null,
    forceX: null,
    includeZero: false,
    showLegend: false,
    legendHeight: 100,
    lineType: d3.svg.line,
    shouldRender: false,
    getX: function(elem) { return elem.x; },
    getY: function(elem) { return elem.y; },

    // User defined callbacks.
    onRender: null,
    onClick: null,
    onMouseMove: null,

    // Normally, the component chooses its size based on the container size, as
    // the CSS formats it. If CSS doesn't specify a size, then these default
    // values are used. To force a specific size, override the 'height' and
    // 'width' attributes or apply CSS height and width styles to the div.
    defaultWidth: 600,
    defaultHeightRatio: 0.5,
    _legendActualHeight: 0,

    showTooltip: true,
    timeFormatter: d3.time.format.utc,

    valueFormatFn: d3.format(''),
    valueTickFormatFn: d3.format('.2s'),

    line: function() {
      var xScale = this.get('xScale'),
          yScale = this.get('yScale');
      return this.get('lineType')()
        .x(function(d) { return xScale(d.x); })
        .y(function(d) { return yScale(d.y); });
    }.property('lineType', 'xScale', 'yScale'),
    xScale: function() {
      return d3.time.scale.utc().domain(this.get('xDomain')).range([0, this.get('_mainChartWidth')]);
    }.property('xDomain', '_mainChartWidth'),
    yScale: function() {
      return d3.scale.linear().domain(this.get('yDomain')).range([this.get('_mainChartHeight'), 0]);
    }.property('yDomain', '_mainChartHeight'),
    xAxis: function() {
      return d3.svg.axis().orient('bottom').ticks(7).scale(this.get('xScale')).tickFormat(this.get('timeTickFormatFn'));
    }.property('xScale', 'timeTickFormatFn'),
    yAxis: function() {
      return d3.svg.axis().orient('left').scale(this.get('yScale')).tickFormat(this.get('valueTickFormatFn'));
    }.property('yScale', 'valueTickFormatFn'),
    xGrid: function() {
      return d3.svg.axis().orient('bottom').ticks(7).tickFormat('').scale(this.get('xScale'))
        .tickSize(-1 * this.get('_mainChartHeight'), 0, 0);
    }.property('xScale', '_mainChartHeight'),
    yGrid: function() {
      return d3.svg.axis().orient('left').tickFormat('').scale(this.get('yScale'))
        .tickSize(-1 * this.get('_mainChartWidth'), 0, 0);
    }.property('yScale', '_mainChartWidth'),

    applyUserOptions: function() {
      var options = this.getWithDefault('options', Ember.Object.create()),
          keys = Ember.keys(options);

      // Iterate through each key in the user-provided options and use them in
      // this chart.
      keys.forEach(function(elem) {
        this.set(elem, options.get(elem));
      }, this);

      this._render();
    }.observes('options'),

    height: function() {
      var elementId = this.get('elementId'),
          $container = $('#' + elementId),
          height = $container.height(),
          heightRatio = this.get('defaultHeightRatio'),
          width = this.get('width');

      if (height === 0) {
        // The browser didn't determine a height for the div, so fall back to
        // a default height.

        return heightRatio * width;
      }
      return height;
    }.property('width', 'defaultHeightRatio'),
    width: function() {
      var elementId = this.get('elementId'),
          $container = $('#' + elementId),
          width = $container.width();

      if (width === 0) {
        // The browser didn't determine a width for the div, so fall back to
        // a default width.
        return this.get('defaultWidth');
      }
      return width;
    }.property('defaultWidth'),
    svgHeight: function() {
      return this.get('height') - this.get('_legendActualHeight');
    }.property('height', '_legendActualHeight'),
    _mainChartHeight: function() {
      var height = this.get('svgHeight'),
          margins = this.get('margins');
      return height - margins.top - margins.bottom;
    }.property('svgHeight', 'margins'),
    _mainChartWidth: function() {
      var width = this.get('width'),
          margins = this.get('margins');
      return width - margins.right - margins.left;
    }.property('width', 'margins'),
    timeFormatFn: function() {
      var data = this.get('_data'),
          timeFormatter = this.get('timeFormatter'),
          avgGranularity = this._getAverageGranularity(data);

      // If the average granularity is around or greater than one point per day,
      // only show month and date.
      if (avgGranularity >= 0.85 * MILLISECONDS_IN_DAY) {
        return timeFormatter('%m/%d');
      }

      // If the average granularity is less than a minute, show the month, date,
      // hour, minute, and second.
      if (avgGranularity <= MILLISECONDS_IN_MINUTE) {
        return timeFormatter('%m/%d %H:%M:%S');
      }

      // Otherwise, show month, date, hour, and minute.
      return timeFormatter('%m/%d %H:%M');
    }.property('_data', 'timeFormatter'),

    tooltipContentFn: function() {
      var valueFormatFn = this.get('valueFormatFn'),
          timeFormatFn = this.get('timeFormatFn');

      return function(x, y, elem, seriesName) {
        return '<h5>' + seriesName + '</h5>' +
               '<hr />' +
               '<p>' + valueFormatFn(y) + ' at ' +
               timeFormatFn(new Date(x)) + '</p>';
      };
    }.property('valueFormatFn', 'timeFormatFn'),

    lineFn: function() {
      var line = this.get('line');
      return function(d) {
        if (d.disabled) {
          return line([]);
        } else {
          return line(d.values);
        }
      };
    }.property('line'),

    /***************************************************************************
     * Private variables and functions that should not be overwritten.
     **************************************************************************/

    timeTickFormatFn: function() {
      var data = this.get('_data'),
          xDomain = this.get('xDomain'),
          totalTimeRange = xDomain[1] - xDomain[0],
          timeFormatter = this.get('timeFormatter'),
          avgGranularity = this._getAverageGranularity(data);

      // If the average granularity is around or greater than one point per day,
      // only show month and date.
      if (avgGranularity >= 0.85 * MILLISECONDS_IN_DAY) {
        return timeFormatter('%m/%d');
      }

      // If more than 5 days are being displayed, only show month and date on
      // the axis labels.
      if (totalTimeRange > 5 * MILLISECONDS_IN_DAY) {
        return timeFormatter('%m/%d');
      }

      // If we're showing more than one day, but still not enough days to get
      // rid of time altogether, show both the date and time.
      if (totalTimeRange > MILLISECONDS_IN_DAY) {
        return timeFormatter('%m/%d %H:%M');
      }

      // In the scope of less than a day, show the time without the date.
      return timeFormatter('%H:%M');
    }.property('_data', 'xDomain', 'timeFormatter'),
    xDomain: function() {
      var data = this.get('_data'),
          domain = Ember.EmberViz.Helpers.getDomain(data,
                                                   function(d) { return d.x; });
      return Ember.EmberViz.Helpers.overrideDomain(domain, this.get('forceX'));
    }.property('_data.@each.disabled', 'forceX'),
    yDomain: function() {
      var data = this.get('_data'),
          domain = Ember.EmberViz.Helpers.getDomain(data,
                                                   function(d) { return d.y; });
      return Ember.EmberViz.Helpers.overrideDomain(domain, this.get('forceY'), this.get('includeZero');
    }.property('_data.@each.disabled', 'forceY', 'includeZero'),
    _getAverageGranularity: function(data) {
      var count = 0;
      var total = 0;
      data.forEach(function(series) {
        for (var i = 1; i < series.values.length; i++) {
          var x0 = series.values[i - 1].x;
          var x1 = series.values[i].x;

          count++;
          total += x1 - x0;
        }
      });
      return total / count;
    },
    colorFn: function() {
      var colors = d3.scale.category20().range();
      return function(d, i) { return d.color || colors[i % colors.length]; };
    }.property(),
    _data: function() {
      var result = [],
          data = this.get('data'),
          getX = this.get('getX'),
          getY = this.get('getY');

      // Verify that the getX and getY attributes are functions.
      if (typeof getX !== 'function') {
        console.error('Provided "getX" attribute is not a valid function. ', SEE_DOCUMENTATION_MSG);
        return result;
      }
      if (typeof getY !== 'function') {
        console.error('Provided "getY" attribute is not a valid function. ', SEE_DOCUMENTATION_MSG);
        return result;
      }

      // Verify that the data attribute is valid and that it has a map function.
      if (!data || typeof data.map !== 'function') {
        return result;
      }

      // Make a deep copy of data to avoid manipulating the controller's clean
      // data.
      try {
        result = data.map(function(series) {
          var valuesCopy = series.values.map(function(elem) {
            var x,
                y,
                // scaledX,
                xError = 'Could not extract a valid datapoint using' +
                  ' the supplied "getX" function.' + SEE_DOCUMENTATION_MSG,
                yError = 'Could not extract a valid datapoint using' +
                  ' the supplied "getY" function.' + SEE_DOCUMENTATION_MSG;

            // Use the getX and getY functions to extract the x and y values from
            // each datapoint.
            try {
              x = getX(elem);
            } catch (e) {
              throw xError;
            }
            try {
              y = getY(elem);
            } catch (e) {
              throw yError;
            }

            // Verify that the extracted values are actually numbers.
            if (isNaN(x)) {
              throw xError;
            }
            if (isNaN(y)) {
              throw yError;
            }

            return {
              x: x,
              y: y,
              original: elem
            };
          });

          return Ember.Object.create({
            key: series.key,
            values: valuesCopy,
            disabled: series.disabled
          });
        });
      } catch(e) {
        console.error(e);
        return result;
      }

      return result;
    }.property('data.[]', 'getX', 'getY'),

    _precomputePointLocations: function() {
      var x,
          xCache = {},
          data = this.get('_data'),
          xScale = this.get('xScale'),
          yScale = this.get('yScale');

      data.forEach(function(series) {

        series.values.forEach(function(elem) {

          // Cache the scaled timestamps. It's only efficient to store the
          // cached scaling of the timestamp because each timestamp is probably
          // going to be repeated for each series. Y values are not as likely
          // to be repeated.
          x = xCache[elem.x];
          if (x === undefined) {
            x = xScale(elem.x);
            xCache[elem.x] = x;
          }

          elem.xPx = x;
          elem.yPx = yScale(elem.y);
        });
      });
    },
    _findClosestPoint: function(data, xPosition, yPosition) {
      var closestPoint,
          seriesName,
          curDistSq,
          xDist,
          yDist,
          searchRadius = this.get('tooltipSearchRadius'),

          // Initialize the "closest" point to one unit past the furthest
          // possible point that is still inside the bounding box.
          minDistSq = 2 * (searchRadius) * (searchRadius) + 1;

      data.forEach(function(series) {

        if (series.get('disabled')) {
          return;
        }

        series.values.forEach(function(elem) {

          // Check that the x value is within range.
          xDist = elem.xPx - xPosition;
          if (xDist > searchRadius || xDist < -1 * searchRadius) {
            return;
          }

          // Check that the y value is within range.
          yDist = elem.yPx - yPosition;
          if (yDist > searchRadius || yDist < -1 * searchRadius) {
            return;
          }

          // Check if the proxy distance (distance squared, so as to avoid
          // unnecessary computation time for the square root) is closer than
          // the closest existing point.
          curDistSq = xDist * xDist + yDist * yDist;
          if (curDistSq < minDistSq) {
            closestPoint = elem;
            seriesName = series.key;
            minDistSq = curDistSq;
          }
        });
      });
      if (!closestPoint) {
        return null;
      }
      return {
        point: closestPoint,
        seriesName: seriesName
      };
    },
    _handleMouseMove: function() {
      var prevClosestPoint,
          self = this,
          elementId = this.get('elementId');

      return function() {
        var html,
            newLeft,
            newTop,
            closestPoint,
            closestPointPosition,
            closestPointValues,
            widthPastWindow,
            margins = self.get('margins'),
            position = d3.mouse(this),
            xPosition = position[0],
            yPosition = position[1],
            $tooltipDiv = $('#' + elementId + ' .ev-chart-tooltip'),
            tooltipCircle = d3.select('#' + elementId + ' .ev-tooltip-circle'),
            closestPointInfo = self._findClosestPoint(self.get('_data'), xPosition,
                                                      yPosition),
            userMouseMove = self.get('onMouseMove');

        // If a closest point was found inside the appropriate radius,
        // display information about that point.
        if (closestPointInfo) {
          closestPoint = closestPointInfo.point;
          html = self.get('tooltipContentFn')(closestPoint.x, closestPoint.y,
                                              closestPoint.original,
                                              closestPointInfo.seriesName);

          // Update the tooltipDiv contents.
          $tooltipDiv.html(html);

          // Move the tooltip div near the closest point.
          newLeft = margins.left + closestPoint.xPx;
          newTop = closestPoint.yPx - $tooltipDiv.height() - 10;
          $tooltipDiv
            .css('display', 'inline')
            .css('left', newLeft)
            .css('top', newTop);

          // Determine if the new location of the tooltip goes off the window
          // and move it inside the window if that's the case.
          widthPastWindow = ($tooltipDiv.offset().left + $tooltipDiv.width()) -
            $('body').width();
          if (widthPastWindow > 0) {
            $tooltipDiv.css('left', newLeft - widthPastWindow);
          }

          // If the closest point is different this time, reset the
          // tooltipCircle in preparation for the transition animation.
          if (!Ember.EmberViz.Helpers.arePointsEqual(closestPoint,
                                                     prevClosestPoint)) {
            tooltipCircle.style('display', 'inline')
              .attr('cx', closestPoint.xPx + 'px')
              .attr('cy', closestPoint.yPx + 'px')
              .attr('r', 3)
              .style('opacity', 0.3);
          }

          // Position the tooltipCircle around the closest point.
          tooltipCircle.style('display', 'inline')
            .transition()
            .duration(150)
            .attrTween('r', function(d, i, a) {
              return d3.interpolate(a, 7);
            })
            .styleTween('opacity', function(d, i, a) {
              return d3.interpolate(a, 0.8);
            });

          if (userMouseMove) {
            if (closestPoint) {
              closestPointPosition = {
                x: closestPoint.xPx,
                y: closestPoint.yPx
              };
              closestPointValues = {
                x: closestPoint.x,
                y: closestPoint.y
              };
            }
            userMouseMove(
              {x: position[0], y: position[1]},
              closestPointPosition,
              closestPointValues);
          }

          prevClosestPoint = closestPoint;
        } else {
          prevClosestPoint = null;
          // Hide the tooltip
          $tooltipDiv.css('display', 'none');
          tooltipCircle.style('display', 'none');
        }
      };
    }.property(),
    _handleMouseOut: function() {
      var elementId = this.get('elementId');
      return function() {
        // Hide the tooltip.
        $('#' + elementId + ' .ev-chart-tooltip')
          .css('display', 'none');

        // Hide the tooltip circle.
        d3.select('#' + elementId + ' .ev-tooltip-circle')
          .style('display', 'none');
      };
    }.property(),
    _handleMouseClick: function() {
      var self = this;

      return function() {
        var clickPosition,
            closestPoint,
            position = d3.mouse(this),
            xPosition = position[0],
            yPosition = position[1],
            closestPointInfo = self._findClosestPoint(self.get('_data'), xPosition,
                                                      yPosition),
            userOnClick = self.get('onClick');
        clickPosition = {
          x: position[0],
          y: position[1]
        };
        // If a closest point was found inside the appropriate radius, pass the
        // location and data to the user provided callback;
        if (userOnClick) {
          if (closestPointInfo) {
            closestPoint = closestPointInfo.point;
            userOnClick(clickPosition,
                        {x: closestPoint.xPx, y: closestPoint.yPx},
                        {x: closestPoint.x, y: closestPoint.y});
          } else {
            userOnClick(clickPosition, null, null);
          }
        }
      };
    }.property(),
    didInsertElement: function() {
      var self = this;

      function resize() {
        self.notifyPropertyChange('height');
        self.notifyPropertyChange('width');
        self._render();
      }

      // Re-render the chart when the window is resized.
      $(window).resize(function() {
        Ember.run(resize);
      });
      this.set('shouldRender', true);
      resize();
    },
    _addChartContainer: function() {
      var elementId = this.get('elementId'),
          margins = this.get('margins');

      // Add and size the main svg element for the chart and create the main 'g'
      // container for all of the chart components.
      d3.select('#' + elementId).insert('svg', '#' + elementId + ' .ev-legend')
        .attr('class', 'ev-svg')
        .attr('width', this.get('width'))
        .attr('height', this.get('svgHeight'))
      .append('g')
        .attr('class', 'ev-main')
        .attr('transform',
              'translate(' + margins.left + ',' + margins.top + ')');
    },
    clickCommon: function() {
      var g = d3.select('#' + this.get('elementId') + ' .ev-main');
      g.select('.ev-grid.main-y-grid')
       .call(this.get('yGrid'));
      g.select('.ev-axis.main-x-axis')
       .call(this.get('xAxis'));
      g.select('.ev-axis.main-y-axis')
       .call(this.get('yAxis'));
      g.selectAll('.ev-chart-line')
       .attr('d', this.get('lineFn'));
      this._precomputePointLocations();
    },
    _addLegend: function() {
      var legendDiv,
          self = this,
          elementId = this.get('elementId'),
          legendMargins = this.get('legendMargins'),
          data = this.get('_data'),
          colorFn = this.get('colorFn'),
          $container = $('#' + elementId),
          $legendDiv = $('<div class="ev-legend">')
            .css('max-height', this.get('legendHeight'))
            .css('margin-top', legendMargins.top)
            .css('margin-right', legendMargins.right)
            .css('margin-bottom', legendMargins.bottom)
            .css('margin-left', legendMargins.left);

      $container.append($legendDiv);

      // jQuery can't add the svg and circle elements correctly, so switch to
      // using d3.
      legendDiv = d3.select('#' + elementId + ' .ev-legend');
      data.forEach(function(elem, index) {
        var key = elem.key,
            normalColor = colorFn(elem, index),
            startingColor = (elem.get('disabled')) ? 'white' : normalColor,
            div = legendDiv.append('div');

        var circle = div.append('svg')
          .attr('class', 'ev-svg')
          .attr('height', 12)
          .attr('width', 14)
        .append('circle')
          .attr('fill', startingColor)
          .attr('stroke', 'black')
          .attr('cx', 6)
          .attr('cy', 6)
          .attr('r', 5);

        div.append('a')
          .text(key + ' ');

        var clickTimeoutId = 0,
            doubleclick = false;
        div.on('dblclick', function() {
          var userData = self.get('data');
          doubleclick = true;

          // Communicate the disabled status of each element back to the
          // original data array.
          userData.setEach('disabled', true);
          userData[index].disabled = false;

          // Record the disabled status of each element in the internal array.
          data.setEach('disabled', true);
          elem.set('disabled', false);

          legendDiv.selectAll('circle')
            .attr('fill', 'white');
          circle.attr('fill', normalColor);
          self.get('clickCommon').call(self);
          window.setTimeout(function() { doubleclick = false; }, 800);
        });
        div.on('click', function() {
          var newColor,
              userData = self.get('data');
          if (!clickTimeoutId) {
            clickTimeoutId = window.setTimeout(function() {
              if (!doubleclick) {
                elem.toggleProperty('disabled');
                userData[index].disabled = elem.get('disabled');
                newColor = (elem.get('disabled')) ? 'white' : normalColor;
                circle.attr('fill', newColor);
                self.get('clickCommon').call(self);
              }
              clickTimeoutId = 0;
            }, 200);
          }
        });
      });
      this.set('_legendActualHeight', $legendDiv.outerHeight());
    },

    _addTooltip: function() {
      var elementId = this.get('elementId'),
          $container = $('#' + elementId);

      // Create and add the tooltip div.
      var $tooltipDiv = $('<div>').addClass('ev-chart-tooltip');
      $container.append($tooltipDiv);

      // Add a circle for use with the tooltip.
      d3.select('#' + elementId + ' .ev-main')
        .append('circle')
        .attr('class', 'ev-tooltip-circle')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', 5);
    },
    _addHoverRect: function() {
      // Add an invisible rectangle to detect mouse movements.
      d3.select('#' + this.get('elementId') + ' .ev-main')
        .append('rect')
        .attr('class', 'hover-rect')
        .attr('width', this.get('_mainChartWidth'))
        .attr('height', this.get('_mainChartHeight'))
        .style('opacity', 0)
        .on('mousemove', this.get('_handleMouseMove'))
        .on('click', this.get('_handleMouseClick'))
        .on('mouseout', this.get('_handleMouseOut'));
    },
    _addChartLines: function() {
      // Add the clip path to hide the lines outside of the main window.
      var elementId = this.get('elementId'),
          clipPathId = elementId + '-clip-path',
          g = d3.select('#' + elementId + ' .ev-main');

      g.append('clipPath')
       .attr('id', clipPathId)
       .append('rect')
       .attr('width', this.get('_mainChartWidth'))
       .attr('height', this.get('_mainChartHeight'));
      g.append('g')
       .attr('class', 'ev-chart-lines')
       .selectAll('.ev-chart-line')
       .data(this.get('_data'))
       .enter()
        .append('path')
        .attr('class', 'ev-chart-line')
        .attr('clip-path', 'url(#' + clipPathId + ')')
        .attr('d', this.get('lineFn'))
        .style('stroke', this.get('colorFn'));
    },
    _addMainAxes: function() {
      var g = d3.select('#' + this.get('elementId') + ' .ev-main');
      g.append('g')
       .attr('class', 'ev-axis main-x-axis')
       .attr('transform', 'translate(0,' + this.get('_mainChartHeight') + ')')
       .call(this.get('xAxis'));
      g.append('g')
       .attr('class', 'ev-axis main-y-axis')
       .call(this.get('yAxis'));
    },
    _addMainGrid: function() {
      var g = d3.select('#' + this.get('elementId') + ' .ev-main');
      g.append('g')
         .attr('class', 'ev-grid main-y-grid')
         .call(this.get('yGrid'));

      g.append('g')
         .attr('class', 'ev-grid main-x-grid')
         .attr('transform', 'translate(0,' + this.get('_mainChartHeight') + ')')
         .call(this.get('xGrid'));
    },
    observesHeight: function() {
      d3.select('#' + this.get('elementId') + ' .ev-svg')
        .attr('height', this.get('svgHeight'));
    }.observes('svgHeight'),
    _render: function() {
      var shouldRender = this.get('shouldRender'),
          data = this.get('_data'),
          showLegend = this.get('showLegend'),
          showTooltip = this.get('showTooltip'),
          userOnRender = this.get('onRender');

      if (!shouldRender) {
        return;
      }

      // Clear the div.
      $('#' + this.get('elementId')).empty();

      // TODO: replace this with some computed property so we don't need data in
      // the render function.
      if (Ember.isEmpty(data)) {
        return;
      }

      this._addChartContainer();

      if (showLegend) {
        this._addLegend();
      }

      this._addMainGrid();
      this._addMainAxes();
      this._addChartLines();

      if (showTooltip) {
        this._addTooltip();
        this._addHoverRect();
        this._precomputePointLocations();
      }

      // If the user supplied an onRender callback, call it.
      if (userOnRender) {
        userOnRender();
      }
    }.observes('_data')
  });

  Ember.Handlebars.helper('line-chart', Ember.EmberViz.LineChartComponent);
}) ();

$(function() {
  Ember.EmberViz.FocusWithContextChartComponent =
    Ember.EmberViz.LineChartComponent.extend({

    classNames: ['ev-focus-with-context-chart'],
    brushExtent: null,
    defaultHeight: 400,
    defaultWidth: 600,
    contextHeight: 70,
    contextWidth: Ember.computed.alias('width'),
    contextMargins: {top: 10, right: 20, bottom: 30, left: 50},

    // User defined callbacks.
    onBrush: null,

    contextLine: function() {
      var self = this;
      return this.get('lineType')()
        .x(function(d) { return self.get('x2Scale')(d.x); })
        .y(function(d) { return self.get('y2Scale')(d.y); });
    }.property('lineType', 'x2Scale', 'y2Scale'),
    contextLineFn: function() {
      var line = this.get('contextLine');
      return function(d) {
        if (d.disabled) {
          return line([]);
        } else {
          return line(d.values);
        }
      };
    }.property('contextLine'),
    x2Scale: function() {
      return d3.time.scale.utc().domain(this.get('x2Domain')).range([0, this.get('_contextChartWidth')]);
    }.property('x2Domain', '_contextChartWidth'),
    y2Scale: function() {
      return d3.scale.linear().domain(this.get('y2Domain')).range([this.get('_contextChartHeight'), 0]);
    }.property('y2Domain', '_contextChartHeight'),
    x2Axis: function() {
      return d3.svg.axis().orient('bottom').ticks(7).scale(this.get('x2Scale'))
        .tickFormat(this.get('timeTickFormatFn'));
    }.property(),
    xDomain: function() {
      var brushExtent = this.get('brushExtent'),
          domain = Ember.EmberViz.Helpers.getDomain(this.get('_data'), function(d) { return d.x; });
      if (brushExtent) {
        domain = brushExtent;
      }
      return Ember.EmberViz.Helpers.overrideDomain(domain, this.get('forceX'));
    }.property('_data', 'brushExtent', 'forceX'),
    x2Domain: function() {
      var domain = Ember.EmberViz.Helpers.getDomain(this.get('_data'),
                                                   function(d) { return d.x; });
      return Ember.EmberViz.Helpers.overrideDomain(domain, this.get('forceX'));
    }.property('_data', 'forceX'),
    yDomain: function() {
      var domain,
          data = this.get('_data'),
          brushExtent = this.get('brushExtent');

      // If there is a brushExtent, we should restrict the y domain to the
      // points within the brushExtent timespan.
      if (brushExtent) {
        var minValue = null,
            maxValue = null,
            enabledSeries = data.rejectBy('disabled');

        enabledSeries.forEach(function(series) {
          series.values.forEach(function(point) {

            if (point.x >= brushExtent[0] && point.x <= brushExtent[1]) {
              if (minValue === null || point.y < minValue) {
                minValue = point.y;
              }
              if (maxValue === null || point.y > maxValue) {
                maxValue = point.y;
              }
            }
          });
        });
        domain = [minValue, maxValue];
      } else {
        domain = Ember.EmberViz.Helpers.getDomain(data,
                                                   function(d) { return d.y; });
      }
      return Ember.EmberViz.Helpers.overrideDomain(domain,
                                                   this.get('forceY'),
                                                   this.get('includeZero'));
    }.property('_data.@each.disabled', 'brushExtent', 'forceY', 'includeZero'),
    y2Domain: function() {
      var data = this.get('_data'),
          brushExtent = this.get('brushExtent');

      // If there is a brushExtent, we should restrict the y domain to the
      // points within the brushExtent timespan.
      if (brushExtent) {
        var minValue = null,
            maxValue = null,
            enabledSeries = data.rejectBy('disabled');

        enabledSeries.forEach(function(series) {
          series.values.forEach(function(point) {
            if (point.x >= brushExtent[0] && point.x <= brushExtent[1]) {
              if (minValue === null || point.y < minValue) {
                minValue = point.y;
              }
              if (maxValue === null || point.y > maxValue) {
                maxValue = point.y;
              }
            }
          });
        });
        return [minValue, maxValue];
      } else {
        return Ember.EmberViz.Helpers.getDomain(data,
                                                function(d) { return d.y; });
      }
    }.property('_data', 'brushExtent'),
    _contextChartHeight: function() {
      var margins = this.get('contextMargins');
      return this.get('contextHeight') - margins.bottom - margins.top;
    }.property('contextHeight', 'contextMargins'),
    _contextChartWidth: function() {
      var margins = this.get('contextMargins');
      return this.get('contextWidth') - margins.left - margins.right;
    }.property('contextWidth', 'contextMargins'),
    _mainChartHeight: function() {
      var margins = this.get('margins');
      return this.get('svgHeight') - this.get('contextHeight') - margins.top - margins.bottom;
    }.property('svgHeight', 'contextHeight', 'margins'),
    _addContextLines: function() {
      var mainHeight = this.get('_mainChartHeight'),
          data = this.get('_data'),
          margins = this.get('margins'),
          contextMargins = this.get('contextMargins');

      d3.select('#' + this.get('elementId') + ' .ev-main')
        .append('g')
        .attr('class', 'ev-context-chart-lines')
        .selectAll('.ev-context-chart-line')
        .data(data)
       .enter()
        .append('path')
        .attr('class', 'ev-context-chart-line')
        .attr('transform',
              'translate(0,' + (mainHeight + margins.bottom +
                                contextMargins.top) + ')')
        .attr('d', this.get('contextLineFn'))
        .style('stroke', this.get('colorFn'));
    },
    _addContextAxis: function() {
      var mainChartHeight = this.get('_mainChartHeight'),
          contextChartHeight = this.get('_contextChartHeight'),
          margins = this.get('margins'),
          contextMargins = this.get('contextMargins');

      // Add the context x-axis.
      d3.select('#' + this.get('elementId') + ' .ev-main')
        .append('g')
        .attr('class', 'ev-axis context-x-axis')
        .attr('transform',
             'translate(0,' + (mainChartHeight + margins.bottom +
                               contextChartHeight + contextMargins.top) + ')')
        .call(this.get('x2Axis'));
    },
    brush: function() {
      var brush,
          self = this,
          elementId = this.get('elementId'),
          brushExtent = this.get('brushExtent');

      function onBrush() {
        var g = d3.select('#' + elementId + ' .ev-main'),
            showTooltip = self.get('showTooltip'),
            userOnBrush = self.get('onBrush');

        brushExtent = brush.empty() ? null : brush.extent();
        self.set('brushExtent', brushExtent);

        g.select('.ev-grid.main-x-grid')
         .call(self.get('xGrid'));
        g.select('.ev-grid.main-y-grid')
         .call(self.get('yGrid'));
        g.select('.ev-axis.main-x-axis')
         .call(self.get('xAxis'));
        g.select('.ev-axis.main-y-axis')
         .call(self.get('yAxis'));
        g.select('.ev-chart-lines')
         .selectAll('.ev-chart-line')
         .attr('d', self.get('lineFn'));

        self._updateBrushBG();

        // If we are showing a tooltip, we should recompute the point to pixel
        // coordinates.
        if (showTooltip) {
          self._precomputePointLocations();
        }

        // If the user supplied an onbrush callback, call it.
        if (userOnBrush) {
          userOnBrush(brushExtent);
        }
      }

      brush = d3.svg.brush()
        .x(this.get('x2Scale'))
        .on('brush', onBrush);
      if (brushExtent) {
        brush.extent(brushExtent);
      }
      return brush;
    }.property('x2Scale'),
    _updateBrushBG: function() {
      var brush = this.get('brush'),
          brushExtent = this.get('brushExtent'),
          x2Scale = this.get('x2Scale'),
          elementId = this.get('elementId');

      d3.select('#' + elementId + ' .ev-context-brush-background')
        .data([brush.empty() ? x2Scale.domain() : brushExtent])
        .each(function(d) {
          var leftWidth = x2Scale(d[0]) - x2Scale.range()[0],
              rightWidth = x2Scale.range()[1] - x2Scale(d[1]);
          d3.select(this).select('.left')
            .attr('width', leftWidth < 0 ? 0 : leftWidth);

          d3.select(this).select('.right')
            .attr('x', x2Scale(d[1]))
            .attr('width', rightWidth < 0 ? 0 : rightWidth);
        });
    },
    _addContextBrush: function() {
      var contextG,
          brushBG,
          gBrush,
          brushBGenter,
          elementId = this.get('elementId'),
          g = d3.select('#' + elementId + ' .ev-main'),
          _mainChartHeight = this.get('_mainChartHeight'),
          margins = this.get('margins'),
          contextMargins = this.get('contextMargins'),
          _contextChartHeight = this.get('_contextChartHeight'),
          brush = this.get('brush');
      contextG = g.append('g')
        .attr('class', 'ev-brush')
        .attr('transform',
              'translate(0,' + (_mainChartHeight + margins.bottom +
                                contextMargins.top) + ')');
      contextG.append('g')
        .attr('class', 'ev-context-brush-background');
      gBrush = contextG.append('g')
        .attr('class', 'ev-context-brush');

      brushBG = contextG.select('.ev-context-brush-background').selectAll('g')
        .data([brush.extent()]);

      brushBGenter = brushBG.enter()
        .append('g');

      brushBGenter.append('rect')
        .attr('class', 'left')
        .attr('x', 0)
        .attr('y', 0)
        .attr('height', _contextChartHeight);

      brushBGenter.append('rect')
        .attr('class', 'right')
        .attr('x', 0)
        .attr('y', 0)
        .attr('height', _contextChartHeight);

      // Taken from crossfilter (http://square.github.com/crossfilter/)
      function resizePath(d) {
        var e = +(d === 'e'),
            x = e ? 1 : -1,
            y = _contextChartHeight / 3;
        return 'M' + (0.5 * x) + ',' + y +
          'A6,6 0 0 ' + e + ' ' + (6.5 * x) + ',' + (y + 6) +
          'V' + (2 * y - 6) +
          'A6,6 0 0 ' + e + ' ' + (0.5 * x) + ',' + (2 * y) +
          'Z'+
          'M' + (2.5 * x) + ',' + (y + 8) +
          'V' + (2 * y - 8) +
          'M' + (4.5 * x) + ',' + (y + 8) +
          'V' + (2 * y - 8);
      }
      gBrush
        .call(brush);
      gBrush.selectAll('rect')
        .attr('height', _contextChartHeight);
      gBrush.selectAll('.resize').append('path').attr('d', resizePath);
    },

    _render: function() {
      var shouldRender = this.get('shouldRender'),
          elementId = this.get('elementId'),
          data = this.get('_data'),
          showLegend = this.get('showLegend'),
          showTooltip = this.get('showTooltip'),
          userOnRender = this.get('onRender');

      if (!shouldRender) {
        return;
      }

      // Clear the div.
      $('#' + elementId).empty();

      if (Ember.isEmpty(data)) {
        return;
      }

      this._addChartContainer();

      if (showLegend) {
        this._addLegend();
      }

      this._addMainGrid();
      this._addMainAxes();
      this._addContextAxis();
      this._addChartLines();
      this._addContextLines();

      if (showTooltip) {
        this._addTooltip();
        this._addHoverRect();
        this._precomputePointLocations();
      }

      this._addContextBrush();

      if (userOnRender) {
        userOnRender();
      }
    }.observes('_data', 'showLegend', 'showTooltip', 'onRender')
  });

  Ember.Handlebars.helper('focus-with-context-chart',
                          Ember.EmberViz.FocusWithContextChartComponent);
});
