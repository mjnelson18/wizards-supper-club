import type { ReactNode } from 'react';
import { Card, PageTitle } from '../components/ui.tsx';

function Term({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="border-b border-line py-3 last:border-0 last:pb-0 first:pt-0">
      <dt className="font-semibold">{name}</dt>
      <dd className="mt-1 text-sm text-ink-2">{children}</dd>
    </div>
  );
}

export function Methods() {
  return (
    <>
      <PageTitle title="How the numbers are worked out" sub="Every figure on the site comes from the same set of rules, set out here." />

      <Card title="Circuits and winners">
        <dl>
          <Term name="Circuit">One round in which every current member chooses a restaurant once. Evenings are always shown in circuit order, then by their number within the circuit, never by date.</Term>
          <Term name="Circuit winner">The chooser of the evening with the highest evening average in that circuit, among evenings with 3 or more scores. Where the group has declared an official result, that result is shown instead and marked Official.</Term>
          <Term name="Provisional">A circuit is provisional while any of its evenings has a score still owed or an unknown attendance, or while a current member has yet to host in it. Provisional circuits show a leader, not a winner, and do not count towards circuit wins.</Term>
          <Term name="Gone and due">Gone are the members who have chosen in the circuit. Due are current members who have not. Former members are never due.</Term>
          <Term name="Qualifying for a leaderboard">A restaurant needs at least 3 scores to be ranked. Evenings with fewer are listed greyed out underneath.</Term>
        </dl>
      </Card>

      <Card title="What each status means">
        <dl>
          <Term name="Scored">Attended and gave a score. Counts in all score maths.</Term>
          <Term name="Imputed (marked *)">An average entered in place of a missing score. Treated as a score.</Term>
          <Term name="Average">Attended and asked to be given the evening's average. Counts as attended, adds no number.</Term>
          <Term name="TBC">Attended, score not yet given. Counts as attended and is shown as a score owed.</Term>
          <Term name="UNK">Attendance unknown. Left out of attendance maths.</Term>
          <Term name="DNA">Did not attend.</Term>
        </dl>
      </Card>

      <Card title="Scores">
        <dl>
          <Term name="Evening average">The mean of the evening's Scored and Imputed scores.</Term>
          <Term name="Gymnastic score">Drop the single highest and the single lowest score and average the rest. Needs 3 or more scores.</Term>
          <Term name="Absentee-adjusted average">An estimate of what the evening would have scored had everyone come. Each absentee is assumed to give the evening average, shifted by their own score index: (sum of scores + evening average × number absent + the absentees' score indexes) ÷ (number of scores + number absent).</Term>
          <Term name="Divisiveness">The standard deviation of an evening's scores (the population form, as a spreadsheet's STDEVP gives). Needs 3 or more scores. Higher means the table disagreed more.</Term>
          <Term name="Circuit average">The mean of every individual score given in the circuit.</Term>
        </dl>
      </Card>

      <Card title="Wizards">
        <dl>
          <Term name="Score index (harshness)">A wizard's average score given, minus the overall average of all scores. Negative means a harsh marker. The by-circuit version on Trends compares against that circuit's average instead.</Term>
          <Term name="Self-score bias">The score a wizard gave their own evening, minus the average the others gave it. A profile shows the mean across all their evenings.</Term>
          <Term name="Attendance rate">Evenings attended ÷ (attended + did not attend), counted only while that wizard was a member. Unknown attendance is left out.</Term>
          <Term name="Streaks">Consecutive evenings attended, in circuit order (Scored, Imputed, Average or TBC). A DNA, an unknown, or no record at all ends a streak.</Term>
          <Term name="Head-to-head">Uses only evenings both wizards scored. The typical gap is the average distance between their two scores, whichever way round.</Term>
        </dl>
      </Card>

      <Card title="Cuisines">
        <dl>
          <Term name="Cuisine and region">Each evening is given one cuisine by hand, and each cuisine sits in a broader part of the world so there are enough evenings to compare. Evenings not yet classified are left out.</Term>
          <Term name="Average score for a cuisine">The mean of every individual score given at that cuisine's evenings.</Term>
          <Term name="New to the Council">A cuisine counts as new in the circuit where it first appears.</Term>
          <Term name="Who picks what">Counts each wizard's own choices by region. A repeat is the same cuisine chosen more than once.</Term>
          <Term name="Who rates what">For each evening, take a wizard's score minus the average of everyone else's. Average that gap over a region's evenings, then take off the wizard's usual gap across all evenings, so harshness drops out and only taste is left. A region needs 3 or more such evenings. A wizard's own choices are included.</Term>
        </dl>
      </Card>

      <Card title="Records and trends">
        <dl>
          <Term name="Who nominates whom">Each chooser nominates the next, so a nomination is counted from each evening's chooser to the following evening's chooser within the same circuit.</Term>
          <Term name="Hosting order">Evenings with 3 or more scores, grouped by their position in the circuit. The first-half and second-half averages leave out the middle evening of an odd-length circuit and any circuit still under way.</Term>
          <Term name="Latest evening">The most recent dated evening. Circuits 1 to 6 have no dates recorded, so they never count as the latest.</Term>
        </dl>
      </Card>

      <Card title="Where the data comes from">
        <p className="text-sm text-ink-2">
          The site is rebuilt from the Council's score sheet several times a day. It reads only the evening list and each wizard's status and score. Written comments are never read or published. The time of the last refresh is shown at the foot of every page.
        </p>
      </Card>
    </>
  );
}
