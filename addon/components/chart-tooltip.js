import ChartSettings from 'ember-viz/mixins/chart-settings';
import Ember from 'ember';

export default Ember.Component.extend(ChartSettings, {
  classNames: ['ev-chart-tooltip'],

  _updateVisibility: Ember.observer('selectedPoint', function() {
    var self = this,
        selectedPoint = this.get('selectedPoint');

    if (Ember.isNone(selectedPoint)) {
      this.$().hide();
    } else {

      // Only reposition the tooltip after it has been rendered.
      Ember.run.schedule('afterRender', function() {
        // TODO: Make the position customizable.
        var newTop = selectedPoint.point.yPx + self.get('mainMargins.top') -
              self.$().outerHeight() - self.get('pointSearchRadius'),
            newLeft = self.get('mainMargins.left') + selectedPoint.point.xPx;

        self.$()
          .css('display', 'inline')
          .css('left', newLeft)
          .css('top', newTop);

      });
    }
  }),

  didInsertElement: function() {
    window.tooltip = this;
    this._updateVisibility();
  }
});
