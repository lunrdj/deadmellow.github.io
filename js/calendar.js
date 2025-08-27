'use strict';

(function () {
  // helper: escape per RFC5545
  function escapeICS(value) {
    if (!value) return '';
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/\r\n|\r|\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  function safeFilename(name) {
    if (!name) return 'event';
    const cleaned = String(name).replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g,'');
    return cleaned || 'event';
  }

  function createICSBlob(item) {
    const dtstamp = new ICAL.Time.now().toString();
    const dtstart = ICAL.Time.fromJSDate(item.date, true).toString();
    const summaryEsc = escapeICS(item.summary || 'Event');
    const uid = safeFilename(item.summary || 'event') + '-' + item.date.getTime();

    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//deadmellow//EN',
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + dtstamp,
      'SUMMARY:' + summaryEsc,
      'DTSTART:' + dtstart,
      'END:VEVENT',
      'END:VCALENDAR'
    ];
    return new Blob([icsLines.join('\r\n')], { type: 'text/calendar' });
  }

  document.addEventListener('DOMContentLoaded', function() {
    const listEl = document.getElementById('calendar-list');
    if (!listEl) return;
    listEl.textContent = 'Loading upcoming shows...';

    fetch('calendar.ics')
      .then(response => {
        if (!response.ok) throw new Error('Network response was not ok');
        return response.text();
      })
      .then(icsText => {
        const jcal = ICAL.parse(icsText);
        const comp = new ICAL.Component(jcal);
        const vevents = comp.getAllSubcomponents('vevent') || [];

        const today = new Date();
        const upcomingOccurrences = [];
        const TOTAL_LIMIT = 5;
        const PER_EVENT_LIMIT = 3;
        // safety cap to avoid infinite loops on malformed recurring rules
        const MAX_ITERATIONS = 500;

        vevents.forEach(component => {
          const ev = new ICAL.Event(component);

          if (ev.isRecurring()) {
            const iterator = ev.iterator();
            let next;
            let perEventCount = 0;
            let iterations = 0;
            // iterate until we collect PER_EVENT_LIMIT future occurrences or hit caps
            while (iterations < MAX_ITERATIONS &&
                   (next = iterator.next()) &&
                   upcomingOccurrences.length < TOTAL_LIMIT &&
                   perEventCount < PER_EVENT_LIMIT) {
              iterations++;
              const date = next.toJSDate();
              if (date >= today) {
                upcomingOccurrences.push({ date, summary: ev.summary || 'Event' });
                perEventCount++;
              }
            }
          } else {
            const date = ev.startDate && ev.startDate.toJSDate ? ev.startDate.toJSDate() : null;
            if (date && date >= today && upcomingOccurrences.length < TOTAL_LIMIT) {
              upcomingOccurrences.push({ date, summary: ev.summary || 'Event' });
            }
          }
        });

        upcomingOccurrences.sort((a, b) => a.date - b.date);
        const upcoming = upcomingOccurrences.slice(0, TOTAL_LIMIT);

        if (upcoming.length) {
          listEl.innerHTML = '';
          upcoming.forEach(item => {
            const container = document.createElement('div');
            container.className = 'event-item';

            const titleEl = document.createElement('h3');
            titleEl.textContent = item.summary;
            titleEl.className = 'event-title';
            container.appendChild(titleEl);

            const dateEl = document.createElement('p');
            dateEl.className = 'event-date';
            dateEl.textContent = item.date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
            container.appendChild(dateEl);

            const link = document.createElement('a');
            link.href = '#';
            link.className = 'add-calendar-link';
            link.textContent = 'Add to calendar';

            link.addEventListener('click', function(e) {
              e.preventDefault();
              const blob = createICSBlob(item);
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = safeFilename(item.summary || 'event') + '.ics';
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
            });

            container.appendChild(link);
            listEl.appendChild(container);
          });
        } else {
          listEl.innerHTML = '<p>No upcoming shows.</p>';
        }
      })
      .catch(err => {
        console.error(err);
        listEl.innerHTML = '<p>Could not load events.</p>';
      });
  });
})();