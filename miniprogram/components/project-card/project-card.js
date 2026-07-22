Component({
  properties: { project: Object },
  methods: {
    onTap() {
      this.triggerEvent('open', { id: this.properties.project._id });
    },
    onCancel() {
      this.triggerEvent('cancel', { id: this.properties.project._id });
    },
    onRemove() {
      this.triggerEvent('remove', { id: this.properties.project._id });
    }
  }
});
