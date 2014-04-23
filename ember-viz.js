(function() {
  Ember.EmberViz = Ember.Namespace.create();

  Ember.libraries.register('EmberViz', '0.1.9');
})();

var MILLISECONDS_IN_MINUTE = 60000;
var MILLISECONDS_IN_DAY = MILLISECONDS_IN_MINUTE * 60 * 24;
var SEE_DOCUMENTATION_MSG = 'See https://github.com/tellapart/ember-viz for' +
  ' EmberViz usage details.';

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
  Ember.EmberViz.BaseComponent = Ember.Component.extend({
    margins: {top: 20, right: 20, bottom: 30, left: 50},
    contextMargins: {top: 10, right: 20, bottom: 30, left: 50},
    shouldRender: false,
    showTooltip: true,
    showContext: false,
    valueFormatFn: d3.format(''),
    valueTickFormatFn: d3.format('.2s'),
    timeFormatter: d3.time.format.utc,
    getX: function(elem) { return elem.x; },
    getY: function(elem) { return elem.y; },

    svgHeight: Ember.computed.alias('height'),
    svgWidth: Ember.computed.alias('width'),
    contextWidth: Ember.computed.alias('width'),
    contextHeight: 70,

    xGridTicks: 5,
    yGridTicks: 5,

    startOpacity: 0.5,
    hoverOpacity: 0.8,

    // Normally, the component chooses its size based on the container size, as
    // the CSS formats it. If CSS doesn't specify a size, then these default
    // values are used. To force a specific size, override the 'height' and
    // 'width' attributes or apply CSS height and width styles to the div.
    defaultWidth: 600,
    defaultHeightRatio: 0.5,

    initialize: function() {
      this.applyUserOptions();
    }.on('init'),

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
      var height = this.$().height(),
          heightRatio = this.get('defaultHeightRatio'),
          width = this.get('width');

      if (height === 0) {
        // The browser didn't determine a height for the div, so fall back to
        // a height determined by a ratio of the width.

        return heightRatio * width;
      }
      return height;
    }.property('width', 'defaultHeightRatio'),

    width: function() {
      var width = this.$().width();

      if (width === 0) {
        // The browser didn't determine a width for the div, so fall back to
        // a default width.
        return this.get('defaultWidth');
      }
      return width;
    }.property('defaultWidth'),
    _mainChartHeight: function() {
      var margins = this.get('margins');
      if (this.get('showContext')) {
        return this.get('svgHeight') - this.get('contextHeight') - margins.top - margins.bottom;
      }
      return this.get('svgHeight') - margins.top - margins.bottom;
    }.property('svgHeight', 'contextHeight', 'margins', 'showContext'),
    _mainChartWidth: function() {
      var width = this.get('svgWidth'),
          margins = this.get('margins');
      return width - margins.right - margins.left;
    }.property('width', 'margins'),
    _contextChartHeight: function() {
      var margins = this.get('contextMargins');

      if (!this.get('showContext')) {
        return 0;
      }
      return this.get('contextHeight') - margins.bottom - margins.top;
    }.property('showContext', 'contextHeight', 'contextMargins'),
    _contextChartWidth: function() {
      var margins = this.get('contextMargins');
      return this.get('contextWidth') - margins.left - margins.right;
    }.property('contextWidth', 'contextMargins'),

    timeTickFormatFn: function() {
      return this._getTimeTickFormatFn(this.get('xDomain'));
    }.property('_data', 'xDomain', 'timeFormatter'),

    _getTimeTickFormatFn: function(domain) {
      var data = this.get('_data'),
          totalTimeRange = domain[1] - domain[0],
          timeFormatter = this.get('timeFormatter'),
          avgGranularity = this._getAverageGranularity(data),
          start = new Date(domain[0]),
          end = new Date(domain[1]);

      // If the start and end date are in different years, show the year.
      if (start.getFullYear() !== end.getFullYear()) {
        return timeFormatter('%m/%d/%y');
      }

      // If the full range of data is on the same date, only display
      // hour:minutes.
      if (start.getFullYear() === end.getFullYear() &&
          start.getMonth() === end.getMonth() &&
          start.getDate() === end.getDate()) {
        return timeFormatter('%H:%M');
      }

      // If the average granularity is around or greater than one point per day,
      // only show month and date.
      if (avgGranularity >= 0.85 * MILLISECONDS_IN_DAY) {
        return timeFormatter('%m/%d');
      }

      // If more than 3 days are being displayed, only show month and date on
      // the axis labels.
      if (totalTimeRange > 3 * MILLISECONDS_IN_DAY) {
        return timeFormatter('%m/%d');
      }

      return timeFormatter('%m/%d %H:%M');
    },

    _addChartContainer: function() {

      // Hack to force the component to compute the height only when the main
      //  div is empty.
      this.notifyPropertyChange('height');
      this.get('height');

      var elementId = this.get('elementId'),
          margins = this.get('margins'),
          height = this.get('svgHeight');

      // Add and size the main svg element for the chart and create the main 'g'
      // container for all of the chart components.
      d3.select('#' + elementId).insert('svg', '#' + elementId + ' .ev-legend')
        .attr('class', 'ev-svg')
        .attr('width', this.get('width'))
        .attr('height', height)
      .append('g')
        .attr('class', 'ev-main')
        .attr('transform',
              'translate(' + margins.left + ',' + margins.top + ')');
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
    _addTooltip: function() {
      var elementId = this.get('elementId');

      // Create and add the tooltip div.
      var $tooltipDiv = $('<div>').addClass('ev-chart-tooltip');
      this.$().append($tooltipDiv);

      // Add a circle for use with the tooltip.
      d3.select('#' + elementId + ' .ev-main')
        .append('circle')
        .attr('class', 'ev-tooltip-circle')
        .attr('cx', 0)
        .attr('cy', 0)
        .attr('r', 5);
    },
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
    colorFn: function() {
      var colors = d3.scale.category20().range();
      return function(d, i) { return d.color || colors[i % colors.length]; };
    }.property(),
    xDomain: function() {
      var brushExtent = this.get('brushExtent'),
          domain = Ember.EmberViz.Helpers.getDomain(this.get('_data'), function(d) { return d.x; });
      if (this.get('showContext') && !Ember.isNone(brushExtent)) {
        domain = brushExtent;
      }
      return Ember.EmberViz.Helpers.overrideDomain(domain, this.get('forceX'));
    }.property('_data', 'showContext', 'brushExtent', 'forceX'),
    yDomain: function() {
      var domain,
          data = this.get('_data'),
          brushExtent = this.get('brushExtent');

      // If there is a brushExtent, we should restrict the y domain to the
      // points within the brushExtent timespan.
      if (this.get('showContext') && !Ember.isNone(brushExtent)) {
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
    }.property('_data.@each.disabled', 'showContext', 'brushExtent', 'forceY', 'includeZero'),
    xAxis: function() {
      return d3.svg.axis()
        .orient('bottom')
        .ticks(this.get('xGridTicks'))
        .scale(this.get('xScale'))
        .tickFormat(this.get('timeTickFormatFn'));
    }.property('xScale', 'timeTickFormatFn'),
    yAxis: function() {
      return d3.svg.axis()
        .orient('left')
        .ticks(this.get('yGridTicks'))
        .scale(this.get('yScale'))
        .tickFormat(this.get('valueTickFormatFn'));
    }.property('yScale', 'valueTickFormatFn'),

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

    _render: function() {
    },
  });

  /*
   * Basic chart view to display a chart with no tools to manipulate the graph
   * other than a legend.
   */
  Ember.EmberViz.LineChartComponent = Ember.EmberViz.BaseComponent.extend({

    /***************************************************************************
     * Public variables that can be overwritten.
     **************************************************************************/

    classNames: ['ev-line-chart'],

    // Default options. User can override any or all of them by setting an
    // 'options' attribute upon component creation.
    tooltipSearchRadius: 10,
    legendMargins: {top: 0, right: 50, bottom: 0, left: 50},
    forceY: null,
    forceX: null,
    includeZero: false,
    showLegend: false,
    legendHeight: 100,
    lineType: d3.svg.line,

    // User defined callbacks.
    onRender: null,
    onClick: null,
    onMouseMove: null,

    _legendActualHeight: 0,

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
    xGrid: function() {
      return d3.svg.axis().orient('bottom').ticks(this.get('xGridTicks')).tickFormat('').scale(this.get('xScale'))
        .tickSize(-1 * this.get('_mainChartHeight'), 0, 0);
    }.property('xScale', '_mainChartHeight'),
    yGrid: function() {
      return d3.svg.axis().orient('left').ticks(this.get('yGridTicks')).tickFormat('').scale(this.get('yScale'))
        .tickSize(-1 * this.get('_mainChartWidth'), 0, 0);
    }.property('yScale', '_mainChartWidth'),

    svgHeight: function() {
      return this.get('height') - this.get('_legendActualHeight');
    }.property('height', '_legendActualHeight'),

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
            $tooltipDiv = self.$(' .ev-chart-tooltip'),
            tooltipCircle = d3.select('#' + elementId + ' .ev-tooltip-circle'),
            closestPointInfo = self._findClosestPoint(self.get('_data'), xPosition,
                                                      yPosition);

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
              return d3.interpolate(a, self.get('hoverOpacity'));
            });

          if (self.onMouseMove instanceof Function) {
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
            self.onMouseMove(
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
    _handleMouseClick: function() {
      var self = this;

      return function() {
        var clickPosition,
            closestPoint,
            position = d3.mouse(this),
            xPosition = position[0],
            yPosition = position[1],
            closestPointInfo = self._findClosestPoint(self.get('_data'), xPosition,
                                                      yPosition);
        clickPosition = {
          x: position[0],
          y: position[1]
        };
        // If a closest point was found inside the appropriate radius, pass the
        // location and data to the user provided callback;
        if (self.onClick instanceof Function) {
          if (closestPointInfo) {
            closestPoint = closestPointInfo.point;
            self.onClick(clickPosition,
                         {x: closestPoint.xPx, y: closestPoint.yPx},
                         {x: closestPoint.x, y: closestPoint.y});
          } else {
            self.onClick(clickPosition, null, null);
          }
        }
      };
    }.property(),
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
          $legendDiv = $('<div class="ev-legend">')
            .css('max-height', this.get('legendHeight'))
            .css('margin-top', legendMargins.top)
            .css('margin-right', legendMargins.right)
            .css('margin-bottom', legendMargins.bottom)
            .css('margin-left', legendMargins.left);

      this.$().append($legendDiv);

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

      if (!this.get('shouldRender')) {
        return;
      }

      // Clear the div.
      this.$().empty();

      this._addChartContainer();

      // TODO: replace this with some computed property so we don't need data in
      // the render function.
      if (Ember.isEmpty(this.get('_data'))) {
        return;
      }

      if (this.get('showLegend')) {
        this._addLegend();
      }

      this._addMainGrid();
      this._addMainAxes();
      this._addChartLines();

      if (this.get('showTooltip')) {
        this._addTooltip();
        this._addHoverRect();
        this._precomputePointLocations();
      }

      if (this.get('showContext')) {
        this._addContextAxis();
        this._addContextLines();
        this._addContextBrush();
      }

      // If the user supplied an onRender callback, call it.
      if (this.onRender instanceof Function) {
        this.onRender();
      }
    }.observes('_data', 'showLegend', 'showTooltip', 'onRender')
  });

  Ember.Handlebars.helper('line-chart', Ember.EmberViz.LineChartComponent);
}) ();

$(function() {
  Ember.EmberViz.FocusWithContextChartComponent =
    Ember.EmberViz.LineChartComponent.extend({

    classNames: ['ev-focus-with-context-chart'],
    brushExtent: null,
    showContext: true,

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
      return d3.time.scale.utc()
        .domain(this.get('x2Domain'))
        .range([0, this.get('_contextChartWidth')]);
    }.property('x2Domain', '_contextChartWidth'),
    y2Scale: function() {
      return d3.scale.linear()
        .domain(this.get('y2Domain'))
        .range([this.get('_contextChartHeight'), 0]);
    }.property('y2Domain', '_contextChartHeight'),
    x2Axis: function() {
      return d3.svg.axis()
        .orient('bottom')
        .ticks(this.get('xGridTicks'))
        .scale(this.get('x2Scale'))
        .tickFormat(this.get('timeTickFormatFn2'));
    }.property(),
    x2Domain: function() {
      var domain = Ember.EmberViz.Helpers.getDomain(this.get('_data'),
                                                   function(d) { return d.x; });
      return Ember.EmberViz.Helpers.overrideDomain(domain, this.get('forceX'));
    }.property('_data', 'forceX'),
    y2Domain: function() {
      var data = this.get('_data');

      return Ember.EmberViz.Helpers.getDomain(data,
                                              function(d) { return d.y; });

    }.property('_data', 'brushExtent'),
    timeTickFormatFn2: function() {
      return this._getTimeTickFormatFn(this.get('x2Domain'));
    }.property('_data', 'x2Domain', 'timeFormatter'),
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
          brushExtent = this.get('brushExtent'),
          x2Domain = this.get('x2Domain');

      function onBrush() {
        var g = d3.select('#' + elementId + ' .ev-main'),
            showTooltip = self.get('showTooltip');

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
        if (self.onBrush instanceof Function) {
          self.onBrush(brushExtent);
        }
      }

      brush = d3.svg.brush()
        .x(this.get('x2Scale'))
        .on('brush', onBrush);
      if (brushExtent) {
        // Make sure the existing brushExtent fits inside the actual domain
        //  from the data.
        if (brushExtent[0] < x2Domain[0]) {
          brushExtent[0] = x2Domain[0];
        }
        if (brushExtent[1] > x2Domain[1]) {
          brushExtent[1] = x2Domain[1];
        }
        brush.extent(brushExtent);
      }
      return brush;
    }.property('x2Scale', 'x2Domain'),
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
      this._updateBrushBG();
    },

  });

  Ember.Handlebars.helper('focus-with-context-chart',
                          Ember.EmberViz.FocusWithContextChartComponent);
});
$(function() {
  Ember.EmberViz.AreaChartComponent = Ember.EmberViz.BaseComponent.extend({
    showContext: false,
    brushExtent: null,
    yDomain: function() {
      var domain,
          data = this.get('_data'),
          brushExtent = this.get('brushExtent'),
          minValue = null,
          maxValue = null,
          enabledSeries = data.rejectBy('disabled');

      // If there is a brushExtent, we should restrict the y domain to the
      // points within the brushExtent timespan.
      if (this.get('showContext') && !Ember.isNone(brushExtent)) {

        enabledSeries.forEach(function(series) {
          series.values.forEach(function(point) {

            if (point.x >= brushExtent[0] && point.x <= brushExtent[1]) {
              if (minValue === null || point.y0 < minValue) {
                minValue = point.y0;
              }
              var yTop = point.y + point.y0;
              if (maxValue === null || yTop > maxValue) {
                maxValue = yTop;
              }
            }
          });
        });
        domain = [minValue, maxValue];
      } else {
        enabledSeries.forEach(function(series) {
          series.values.forEach(function(point) {
            if (minValue === null || point.y < minValue) {
              minValue = point.y;
            }
            var yTop = point.y + point.y0;
            if (maxValue === null || yTop > maxValue) {
              maxValue = yTop;
            }
          });
        });
        domain = [minValue, maxValue];
      }
      return Ember.EmberViz.Helpers.overrideDomain(domain,
                                                   this.get('forceY'),
                                                   this.get('includeZero'));
    }.property('_data.@each.disabled', 'showContext', 'brushExtent', 'forceY', 'includeZero'),
    xScale: function() {
      return d3.time.scale.utc()
        .domain(this.get('xDomain'))
        .range([0, this.get('_mainChartWidth')]);
    }.property('xDomain', '_mainChartWidth'),
    yScale: function() {
      return d3.scale.linear()
        .domain(this.get('yDomain'))
        .range([this.get('_mainChartHeight'), 0]);
    }.property('yDomain', '_mainChartHeight'),
    xAxis: function() {
      return d3.svg.axis()
        .orient('bottom')
        .ticks(this.get('xGridTicks'))
        .scale(this.get('xScale'))
        .tickFormat(this.get('timeTickFormatFn'));
    }.property('xScale', 'timeTickFormatFn'),
    x2Scale: function() {
      return d3.time.scale.utc()
        .domain(this.get('x2Domain'))
        .range([0, this.get('_contextChartWidth')]);
    }.property('x2Domain', '_contextChartWidth'),
    y2Scale: function() {
      return d3.scale.linear()
        .domain(this.get('y2Domain'))
        .range([this.get('_contextChartHeight'), 0]);
    }.property('y2Domain', '_contextChartHeight'),
    x2Axis: function() {
      return d3.svg.axis()
        .orient('bottom')
        .ticks(this.get('xGridTicks'))
        .scale(this.get('x2Scale'))
        .tickFormat(this.get('timeTickFormatFn2'));
    }.property('x2Scale', 'xGridTicks', 'timeTickFormatFn2'),
    x2Domain: function() {
      var domain = Ember.EmberViz.Helpers.getDomain(this.get('_data'),
                                                   function(d) { return d.x; });
      return Ember.EmberViz.Helpers.overrideDomain(domain, this.get('forceX'));
    }.property('_data', 'forceX'),
    y2Domain: function() {
      var data = this.get('_data');

      return Ember.EmberViz.Helpers.getDomain(data,
                                              function(d) { return d.y + d.y0; });

    }.property('_data', 'brushExtent'),

    // TODO: Extract these into a time-series mixin or something.
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

    timeTickFormatFn2: function() {
      return this._getTimeTickFormatFn(this.get('x2Domain'));
    }.property('_data', 'x2Domain', 'timeFormatter'),

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
        if (data.length === 0) {
          return [];
        }
        var seriesLength = data[0].values.length;
        data.forEach(function(series) {
          if (series.values.length !== seriesLength) {
            throw "All series don't have the same length." + SEE_DOCUMENTATION_MSG;
          }
        });
        result = data.map(function(series) {
          var valuesCopy = series.values.map(function(elem) {
            var x,
                y,
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

      // TODO: Verify that all series have the same x-vals in the same order OR
      //  normalize them so that they do.


      // Calculate the y0 for each series.
      result.forEach(function(series, seriesIndex) {

        series.get('values').forEach(function(elem, elemIndex) {

          // TODO: Make this smarter if the y is negative.
          if (seriesIndex === 0) {
            elem.y0 = 0;
          } else {
            var prevElement = result[seriesIndex - 1].values[elemIndex];
            elem.y0 = prevElement.y0 + prevElement.y;
          }
        });
      });

      return result;
    }.property('data.[]', 'getX', 'getY'),

    area: function() {
      var self = this;
      return d3.svg.area()
        .x(function(d) { return self.get('xScale')(d.x); })
        .y0(function(d) { return self.get('yScale')(d.y0); })
        .y1(function(d) { return self.get('yScale')(d.y0 + d.y); });
    }.property('xScale', 'yScale'),
    contextArea: function() {
      var x2Scale = this.get('x2Scale'),
          y2Scale = this.get('y2Scale');
      return d3.svg.area()
        .x(function(d) { return x2Scale(d.x); })
        .y0(function(d) { return y2Scale(d.y0); })
        .y1(function(d) { return y2Scale(d.y0 + d.y); });
    }.property('x2Scale', 'y2Scale'),
    _addChartAreas: function() {
      var area = this.get('area'),
          data = this.get('_data'),
          colorFn = this.get('colorFn'),
          elementId = this.get('elementId'),
          g = d3.select('#' + elementId + ' .ev-main'),
          clipPathId = elementId + '-clip-path';

      g.append('clipPath')
       .attr('id', clipPathId)
       .append('rect')
       .attr('width', this.get('_mainChartWidth'))
       .attr('height', this.get('_mainChartHeight'));

      var series = g.selectAll('.ev-series')
          .data(data)
        .enter().append('g')
          .attr('class', 'ev-series');

      series.append('path')
        .attr('class', 'ev-area')
        .attr('clip-path', 'url(#' + clipPathId + ')')
        .style('opacity', 0.6)
        .attr('d', function(d) { return area(d.values); })
        .style('fill', colorFn)
        .on('mousemove', this.get('_handleMouseMove'))
        .on('mouseout', this.get('_handleMouseOut'));
    },
    _addContextAreas: function() {
      var mainHeight = this.get('_mainChartHeight'),
          data = this.get('_data'),
          contextArea = this.get('contextArea'),
          margins = this.get('margins'),
          contextMargins = this.get('contextMargins'),
          colorFn = this.get('colorFn'),
          g = d3.select('#' + this.get('elementId') + ' .ev-main');

      var series = g.append('g')
          .attr('class', 'ev-context-series')
          .selectAll('.ev-series')
          .data(data)
        .enter().append('g')
          .attr('class', 'ev-series');

      series.append('path')
        .attr('class', 'ev-context-area')
        .attr('transform',
              'translate(0,' + (mainHeight + margins.bottom +
                                contextMargins.top) + ')')
        .style('opacity', this.get('hoverOpacity'))
        .attr('d', function(d) { return contextArea(d.values); })
        .style('fill', colorFn);
    },
    _handleMouseMove: function() {
      var prevClosestPoint,
          self = this,
          elementId = this.get('elementId');

      return function() {
        var html,
            newLeft,
            newTop,
            widthPastWindow,
            closestPoint = null,
            closestDistance = null,
            margins = self.get('margins'),
            xScale = self.get('xScale'),
            yScale = self.get('yScale'),
            position = d3.mouse(this),
            xPosition = position[0],
            $tooltipDiv = self.$(' .ev-chart-tooltip'),
            tooltipCircle = d3.select('#' + elementId + ' .ev-tooltip-circle'),
            elemInfo = d3.select(this).data()[0];

        // Find the closest point
        elemInfo.get('values').forEach(function(elem) {
          var curDistance = Math.abs(xScale(elem.x) - xPosition);
          if (curDistance < 20 && (Ember.isNone(closestDistance) || curDistance < closestDistance)) {
            closestPoint = elem;
            closestDistance = curDistance;
          }

        });

        if (closestPoint) {
          var xPx = xScale(closestPoint.x),
              yPx = yScale(closestPoint.y + closestPoint.y0);
          html = self.get('tooltipContentFn')(closestPoint.x, closestPoint.y, closestPoint.originalj,
                                              elemInfo.get('key'));

          // Change the opacity of the target element.
          d3.select(this)
            .transition()
            .duration(150)
            .styleTween('opacity', function(d, i, a) {
              return d3.interpolate(a, self.get('hoverOpacity'));
            });

          // Update the tooltipDiv contents.
          $tooltipDiv.html(html);

          // Move the tooltip div near the closest point.
          newLeft = margins.left + xPx;
          newTop = yPx- $tooltipDiv.height() + margins.top;
          $tooltipDiv
            .css('display', 'inline')
            .css('left', newLeft)
            .css('top', newTop);
            // .animate({
            //   left: newLeft,
            //   top: newTop
            // }, 150);


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
              .attr('cx', xPx + 'px')
              .attr('cy', yPx + 'px')
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
              return d3.interpolate(a, self.get('hoverOpacity'));
            });

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
      var elementId = this.get('elementId'),
          self = this;
      return function() {
        var relatedTarget = d3.select(d3.event.relatedTarget);
        if (!relatedTarget.empty() && relatedTarget.attr('class') === 'ev-tooltip-circle') {
          return;
        }

        // Hide the tooltip.
        self.$(' .ev-chart-tooltip')
          .css('display', 'none');

        // Hide the tooltip circle.
        d3.select('#' + elementId + ' .ev-tooltip-circle')
          .style('display', 'none');

        // Change the opacity of the target element.
        d3.select(this)
          .transition()
          .duration(150)
          .styleTween('opacity', function(d, i, a) {
            return d3.interpolate(a, self.get('startOpacity'));
          });
      };
    }.property(),
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
    brush: function() {
      var brush,
          self = this,
          elementId = this.get('elementId'),
          brushExtent = this.get('brushExtent'),
          x2Domain = this.get('x2Domain');

      function onBrush() {
        var g = d3.select('#' + elementId + ' .ev-main'),
            area = self.get('area');

        brushExtent = brush.empty() ? null : brush.extent();
        self.set('brushExtent', brushExtent);

        g.select('.ev-axis.main-x-axis')
         .call(self.get('xAxis'));
        g.select('.ev-axis.main-y-axis')
         .call(self.get('yAxis'));
        g.selectAll('.ev-series')
         .selectAll('.ev-area')
         .attr('d', function(d) { return area(d.values); });

        self._updateBrushBG();

        // If the user supplied an onbrush callback, call it.
        if (self.onBrush instanceof Function) {
          self.onBrush(brushExtent);
        }
      }

      brush = d3.svg.brush()
        .x(this.get('x2Scale'))
        .on('brush', onBrush);
      if (brushExtent) {
        // Make sure the existing brushExtent fits inside the actual domain
        //  from the data.
        if (brushExtent[0] < x2Domain[0]) {
          brushExtent[0] = x2Domain[0];
        }
        if (brushExtent[1] > x2Domain[1]) {
          brushExtent[1] = x2Domain[1];
        }
        brush.extent(brushExtent);
      }
      return brush;
    }.property('x2Scale', 'x2Domain'),
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
      this._updateBrushBG();
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
    _render: function() {
      if (!this.get('shouldRender')) {
        return;
      }

      // Clear the div.
      this.$().empty();

      this._addChartContainer();

      if (Ember.isEmpty(this.get('_data'))) {
        return;
      }

      this._addMainAxes();
      this._addChartAreas();

      if (this.get('showTooltip')) {
        this._addTooltip();
      }

      if (this.get('showContext')) {
        this._addContextAreas();
        this._addContextAxis();
        this._addContextBrush();
      }

    }.observes('_data')
  });

  Ember.Handlebars.helper('area-chart', Ember.EmberViz.AreaChartComponent);
});
$(function() {
  Ember.EmberViz.BarChartComponent = Ember.EmberViz.BaseComponent.extend({
    stacked: true,

    xScale: function() {
      return d3.scale.ordinal()
        .domain(this.get('xDomain'))
        .rangeRoundBands([0, this.get('_mainChartWidth')], 0.08);
    }.property('xDomain', '_mainChartWidth'),

    yScale: function() {
      return d3.scale.linear()
        .domain(this.get('yDomain'))
        .range([this.get('_mainChartHeight'), 0]);
    }.property('yDomain', '_mainChartHeight'),

    xDomain: function() {
      var data = this.get('_data'),
          domainSet = new Ember.Set();

      if (data.length === 0) {
        return [];
      }

      data.forEach(function(series) {
        domainSet.addEach(series.get('values').getEach('x'));
      });

      return domainSet.toArray();
    }.property('_data.[]'),

    yDomain: function() {
      var maxY,
          data = this.get('_data');
      maxY = d3.max(data, function(series) {
        return d3.max(series.values, function(elem) {
          return elem.y0 + elem.y;
        });
      });
      return [0, maxY];
    }.property('_data.@each', 'stacked'),

    xAxis: function() {
      return d3.svg.axis()
        .ticks(this.get('xGridTicks'))
        .scale(this.get('xScale'))
        .tickSize(0)
        .tickPadding(6);
    }.property('xScale'),

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
        if (data.length === 0) {
          return [];
        }
        var seriesLength = data[0].values.length;
        data.forEach(function(series) {
          if (series.values.length !== seriesLength) {
            throw "All series don't have the same length." + SEE_DOCUMENTATION_MSG;
          }
        });
        result = data.map(function(series) {
          var valuesCopy = series.values.map(function(elem) {
            var x,
                y,
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

      // TODO: Verify that all series have the same x-vals in the same order OR
      //  normalize them so that they do.

      // Calculate the y0 for each series.
      result.forEach(function(series, seriesIndex) {

        series.get('values').forEach(function(elem, elemIndex) {

          // TODO: Make this smarter if the y is negative.
          if (seriesIndex === 0) {
            elem.y0 = 0;
          } else {
            var prevElement = result[seriesIndex - 1].values[elemIndex];
            elem.y0 = prevElement.y0 + prevElement.y;
          }
        });
      });

      return result;
    }.property('data.[]', 'getX', 'getY'),

    _addBarLines: function() {
      var elementId = this.get('elementId'),
          data = this.get('_data'),
          colorFn = this.get('colorFn'),
          xScale = this.get('xScale'),
          yScale = this.get('yScale'),
          height = this.get('_mainChartHeight'),
          g = d3.select('#' + elementId + ' .ev-main');

      var layer = g.selectAll('.layer')
          .data(data)
        .enter()
          .append('g')
          .attr('class', 'layer')
          .style("fill", colorFn);

      var rect = layer.selectAll('rect')
          .data(function(d) { return d.values; })
        .enter()
          .append('rect')
          .attr('x', function(d) { return xScale(d.x); })
          .attr('y', height)
          .attr('width', xScale.rangeBand())
          .attr('height', 0)
          .style('opacity', this.get('startOpacity'))
          .on('mousemove', this.get('_handleMouseMove'))
          .on('mouseout', this.get('_handleMouseOut'));

      rect.transition()
        .delay(function(d, i) { return i * 10; })
        .attr('y', function(d) { return yScale(d.y0 + d.y); })
        .attr('height', function(d) { return yScale(d.y0) - yScale(d.y0 + d.y); });

    },
    tooltipContentFn: function() {
      var valueFormatFn = this.get('valueFormatFn');

      return function(x, y, elem, seriesName) {
        return '<h5>' + seriesName + '</h5>' +
               '<hr />' +
               '<p>' + valueFormatFn(y) + ' for ' + x + '</p>';
      };

    }.property('valueFormatFn'),

    _handleMouseMove: function() {
      var self = this;

      return function() {
        var newLeft,
            newTop,
            widthPastWindow,
            margins = self.get('margins'),
            position = d3.mouse(this),
            xPosition = position[0],
            yPosition = position[1],
            $tooltipDiv = self.$(' .ev-chart-tooltip'),
            elemInfo = d3.event.target.__data__,
            parentInfo = d3.event.target.parentNode.__data__,
            html = self.get('tooltipContentFn')(elemInfo.x, elemInfo.y, elemInfo,
                                                parentInfo.get('key'));

        // Change the opacity of the target element.
        d3.select(this)
          .transition()
          .duration(150)
          .styleTween('opacity', function(d, i, a) {
            return d3.interpolate(a, 1.0);
          });

        // Update the tooltipDiv contents.
        $tooltipDiv.html(html);

        // Move the tooltip div near the closest point.
        newLeft = margins.left + xPosition;
        newTop = yPosition - $tooltipDiv.height() + margins.top;
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
      };
    }.property(),
    _handleMouseOut: function() {
      var self = this,
          elementId = this.get('elementId');
      return function() {
        // Hide the tooltip.
        $('#' + elementId + ' .ev-chart-tooltip')
          .css('display', 'none');

        // Hide the tooltip circle.
        d3.select('#' + elementId + ' .ev-tooltip-circle')
          .style('display', 'none');

        // Change the opacity of the target element.
        d3.select(this)
          .transition()
          .duration(150)
          .styleTween('opacity', function(d, i, a) {
            return d3.interpolate(a, self.get('startOpacity'));
          });
      };
    }.property(),

    _render: function() {

      if (!this.get('shouldRender')) {
        return;
      }

      // Clear the div.
      this.$().empty();

      this._addChartContainer();

      if (Ember.isEmpty(this.get('_data'))) {
        return;
      }

      this._addMainAxes();
      this._addBarLines();

      if (this.get('showTooltip')) {
        this._addTooltip();
      }

    }.observes('_data')
  });

  Ember.Handlebars.helper('bar-chart', Ember.EmberViz.BarChartComponent);
});

$(function() {
  Ember.EmberViz.PieChartComponent = Ember.EmberViz.BaseComponent.extend({

    // By default, just use the data points in the order they were passed in.
    sortFn: null,

    getValue: function(elem) {
      return Ember.get(elem, 'value');
    },
    radius: function() {
      return Math.min(this.get('svgHeight'), this.get('svgWidth')) / 2;
    }.property('svgHeight', 'svgWidth'),

    _data: function() {
      var data = this.get('data'),
          getValue = this.get('getValue'),
          result = [];

      if (!(data instanceof Array)) {
        console.error('The provided `data` attribute is not an Array.',
          SEE_DOCUMENTATION_MSG);
        return result;
      }

      return data.map(function(elem) {

        return Ember.Object.create({
          key: Ember.get(elem, 'key'),
          value: getValue(elem),
          original: elem
        });
      });
    }.property('data.[]', 'getValue'),

    pieFn: function() {
      return d3.layout.pie()
        .sort(this.get('sortFn'))
        .value(function(d) { return d.get('value'); });
    }.property('data.[]', 'sortFn'),

    _handleMouseMove: function() {
      var self = this;
      return function() {
        d3.select(this)
          .transition()
          .duration(150)
          .styleTween('opacity', function(d, i, a) {
            return d3.interpolate(a, self.get('hoverOpacity'));
          });
      };
    }.property(),

    _handleMouseOut: function() {
      var self = this;
      return function() {
        d3.select(this)
          .transition()
          .duration(150)
          .styleTween('opacity', function(d, i, a) {
            return d3.interpolate(a, self.get('startOpacity'));
          });
      };
    }.property(),

    _render: function() {

      if (!this.get('shouldRender')) {
        return;
      }

      // Clear the div.
      this.$().empty();

      this._addChartContainer();

      if (Ember.isEmpty(this.get('_data'))) {
        return;
      }

      var svg = d3.select('#' + this.get('elementId') + ' svg')
        .append('g')
        .attr("transform", "translate(" + this.get('svgWidth') / 2 + "," + this.get('svgHeight') / 2 + ")");

      var pie = this.get('pieFn'),
          data = this.get('_data');
      var g = svg.selectAll(".arc")
          .data(pie(data))
        .enter().append("g")
          .attr("class", "arc")
          .style('opacity', this.get('startOpacity'))
          .on('mousemove', this.get('_handleMouseMove'))
          .on('mouseout', this.get('_handleMouseOut'));

      var arc = d3.svg.arc()
          .outerRadius(this.get('radius') - 10)
          .innerRadius(0);

      g.append("path")
        .attr("d", arc)
        .style("fill", this.get('colorFn'));

      g.append("text")
      .style('opacity', 1)
      .attr("transform", function(d) { return "translate(" + arc.centroid(d) + ")"; })
      .attr("dy", ".35em")
      .style("text-anchor", "middle")
      .text(function(d) { return d.data.get('key'); });

    }.observes('_data'),
  });

  Ember.Handlebars.helper('pie-chart', Ember.EmberViz.PieChartComponent);
});
