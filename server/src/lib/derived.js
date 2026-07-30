export function fullName(participant) {
  return `${participant.last_name}, ${participant.first_name}`;
}

export function ageAtTrip(birthDate, tripDate) {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const trip = new Date(`${tripDate}T00:00:00Z`);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(trip.getTime())) return null;

  let age = trip.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = trip.getUTCMonth() - birth.getUTCMonth();
  const dayDiff = trip.getUTCDate() - birth.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age;
}

export function suggestGrade(gradYear, tripYear) {
  // Number(null) and Number('') both coerce to 0, which IS an integer — so
  // this guard must reject null/blank explicitly, not just check the
  // Number() result, or a missing grad_year silently produces a bogus grade.
  if (gradYear === null || gradYear === undefined || gradYear === '') return null;
  const year = Number(gradYear);
  const anchor = Number(tripYear);
  if (!Number.isInteger(year) || !Number.isInteger(anchor)) return null;
  return 12 - (year - anchor);
}

export function withDerived(participant, tripDate, tripYear) {
  return {
    ...participant,
    active: !!participant.active,
    full_name: fullName(participant),
    age_at_trip: ageAtTrip(participant.birth_date, tripDate),
    grade: suggestGrade(participant.grad_year, tripYear),
  };
}
