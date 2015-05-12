import Ember from 'ember';
// import config from './config/environment';

var Router = Ember.Router.extend({
  location: 'hash', //config.locationType
});

Router.map(function() {
  this.resource('line-chart');
  this.resource('context-chart');

  this.route('awesome');
});

export default Router;
