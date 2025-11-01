const mongoose = require('mongoose');

const TodoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200
    },
    completed: {
      type: Boolean,
      default: false
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.Todo || mongoose.model('Todo', TodoSchema);


