const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function pageOffset(page, limit) {
  return (page - 1) * limit;
}

function totalPages(total, limit) {
  return total === 0 ? 0 : Math.ceil(total / limit);
}

function paginated(data, { page, limit, total }) {
  return {
    data,
    total,
    page,
    limit,
    totalPages: totalPages(total, limit),
  };
}

function paginateList(items, page, limit) {
  const total = items.length;
  const offset = pageOffset(page, limit);
  return paginated(items.slice(offset, offset + limit), { page, limit, total });
}

function paginateRecord(record, page, limit) {
  const entries = Object.entries(record || {});
  const total = entries.length;
  const offset = pageOffset(page, limit);
  return paginated(Object.fromEntries(entries.slice(offset, offset + limit)), { page, limit, total });
}

function paginateGrouped(groups, page, limit, paginateGroup) {
  const data = {};
  let total = 0;

  for (const [key, group] of Object.entries(groups)) {
    const pageResult = paginateGroup(group, page, limit);
    data[key] = pageResult.data;
    if (pageResult.total > total) {
      total = pageResult.total;
    }
  }

  return paginated(data, { page, limit, total });
}

module.exports = {
  DEFAULT_PAGE,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  pageOffset,
  paginated,
  paginateList,
  paginateRecord,
  paginateGrouped,
};
