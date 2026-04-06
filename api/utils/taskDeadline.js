const hasOwnProperty = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

const parseDeadlineDate = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('Invalid deadline date');
  }

  return parsedDate;
};

const resolveNormalizedDeadlineDate = ({ dueDate, plannedDate, hasDueDate, hasPlannedDate }) => {
  if (hasDueDate && hasPlannedDate) {
    const normalizedDueDate = parseDeadlineDate(dueDate);
    const normalizedPlannedDate = parseDeadlineDate(plannedDate);

    if (normalizedDueDate && normalizedPlannedDate) {
      return normalizedDueDate;
    }

    return normalizedDueDate || normalizedPlannedDate || null;
  }

  if (hasDueDate) {
    return parseDeadlineDate(dueDate);
  }

  return parseDeadlineDate(plannedDate);
};

const normalizeTaskDeadlinePayload = (payload = {}) => {
  const hasDueDate = hasOwnProperty(payload, 'dueDate');
  const hasPlannedDate = hasOwnProperty(payload, 'plannedDate');

  if (!hasDueDate && !hasPlannedDate) {
    return payload;
  }

  const normalizedDeadlineDate = resolveNormalizedDeadlineDate({
    dueDate: payload.dueDate,
    plannedDate: payload.plannedDate,
    hasDueDate,
    hasPlannedDate
  });

  return {
    ...payload,
    dueDate: normalizedDeadlineDate,
    plannedDate: normalizedDeadlineDate
  };
};

const normalizeTaskDeadlinePair = (dueDate, plannedDate) => {
  const normalizedDueDate = dueDate ? new Date(dueDate) : null;
  const normalizedPlannedDate = plannedDate ? new Date(plannedDate) : null;
  const normalizedDeadlineDate = normalizedDueDate || normalizedPlannedDate || null;

  return {
    dueDate: normalizedDeadlineDate,
    plannedDate: normalizedDeadlineDate
  };
};

module.exports = {
  normalizeTaskDeadlinePayload,
  normalizeTaskDeadlinePair
};
