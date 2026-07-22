Component({
  properties: { project: Object },
  methods: {
    onTap() {
      this.triggerEvent('open', { id: this.properties.project._id });
    }
  }
});
