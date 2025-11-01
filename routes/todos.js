const express = require('express');
const Todo = require('../models/Todo');

const router = express.Router();

// 할일 생성
router.post('/', async (req, res) => {
  try {
    const { title, description, completed } = req.body || {};

    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ message: 'title은 필수 입니다.' });
    }

    const todo = await Todo.create({
      title: title.trim(),
      description: typeof description === 'string' ? description.trim() : undefined,
      completed: typeof completed === 'boolean' ? completed : undefined
    });

    return res.status(201).json(todo);
  } catch (err) {
    return res.status(500).json({ message: '서버 오류', error: err.message });
  }
});

// 할일 조회
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const [items, total] = await Promise.all([
      Todo.find({}).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum),
      Todo.countDocuments({})
    ]);

    return res.json({
      items,
      total,
      page: pageNum,
      limit: limitNum
    });
  } catch (err) {
    return res.status(500).json({ message: '서버 오류', error: err.message });
  }
});

// 할일 수정
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: '유효한 ObjectId가 아닙니다.' });
    }

    const { title, description, completed } = req.body || {};
    const update = {};

    if (typeof title !== 'undefined') {
      if (typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ message: 'title은 비어있을 수 없습니다.' });
      }
      update.title = title.trim();
    }

    if (typeof description !== 'undefined') {
      if (description !== null && typeof description !== 'string') {
        return res.status(400).json({ message: 'description은 문자열이어야 합니다.' });
      }
      update.description = typeof description === 'string' ? description.trim() : description;
    }

    if (typeof completed !== 'undefined') {
      if (typeof completed !== 'boolean') {
        return res.status(400).json({ message: 'completed는 boolean이어야 합니다.' });
      }
      update.completed = completed;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: '수정할 필드가 없습니다.' });
    }

    const updated = await Todo.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true
    });

    if (!updated) {
      return res.status(404).json({ message: '해당 id의 할일을 찾을 수 없습니다.' });
    }

    return res.json(updated);
  } catch (err) {
    return res.status(500).json({ message: '서버 오류', error: err.message });
  }
});

// 할일 삭제
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: '유효한 ObjectId가 아닙니다.' });
    }

    const deleted = await Todo.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: '해당 id의 할일을 찾을 수 없습니다.' });
    }

    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ message: '서버 오류', error: err.message });
  }
});

module.exports = router;


