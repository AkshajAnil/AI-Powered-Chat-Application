const STATUS = ['sent', 'delivered', 'read'];
const STATUS_RANK = { sent: 0, delivered: 1, read: 2 };

const normalizeStatus = (status) => (STATUS.includes(status) ? status : 'sent');

module.exports = { STATUS, STATUS_RANK, normalizeStatus };
