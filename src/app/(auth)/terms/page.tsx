import type {Metadata} from "next";
import Link from "next/link";
import type {ReactNode} from "react";

export const metadata: Metadata = {
  title: "Terms and Conditions | SAIVD",
  description: "Terms and Conditions for SAIVD Creator",
};

function Section({title, children}: {title: string; children: ReactNode}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Subheading({children}: {children: ReactNode}) {
  return <h3 className="text-base font-semibold text-foreground">{children}</h3>;
}

export default function TermsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <div className="space-y-8 rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
        <header className="space-y-3 border-b border-border pb-6">
          <h1 className="text-2xl font-bold">SAIVD Terms &amp; Conditions</h1>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Saivd, Inc.</p>
            <p>
              Contact:{" "}
              <a href="mailto:info@saivd.io" className="text-blue-500 hover:underline">
                info@saivd.io
              </a>{" "}
              ·{" "}
              <a
                href="https://www.saivd.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                https://www.saivd.io
              </a>
            </p>
            <p className="pt-2">
              <span className="font-medium text-foreground">Effective Date:</span> January 1, 2026
            </p>
            <p>
              <span className="font-medium text-foreground">Last Updated:</span> July 15, 2026
            </p>
            <p>
              <span className="font-medium text-foreground">Version:</span> 1.1
            </p>
          </div>
        </header>

        <Section title="1. Agreement to These Terms">
          <p>
            These Terms &amp; Conditions (the &quot;<strong>Terms</strong>&quot;) form a binding
            agreement between <strong>Saivd, Inc.</strong> and its affiliates (&quot;
            <strong>SAIVD</strong>,&quot; &quot;<strong>we</strong>,&quot; &quot;
            <strong>us</strong>,&quot; or &quot;<strong>our</strong>&quot;) and you (&quot;
            <strong>you</strong>&quot; or &quot;<strong>User</strong>&quot;). They govern your
            access to and use of the SAIVD website, applications, software development kit (&quot;
            <strong>SDK</strong>&quot;), application programming interfaces (&quot;
            <strong>APIs</strong>&quot;), watermarking and content-authentication technology, and
            all related products, tools, and services (collectively, the &quot;
            <strong>Services</strong>&quot;).
          </p>
          <p>
            By accessing the website, creating an account, submitting content for authentication,
            integrating the SDK or APIs, or otherwise using the Services, you acknowledge that you
            have read, understood, and agree to be bound by these Terms and by our Privacy Policy,
            which is incorporated by reference.{" "}
            <strong>If you do not agree, do not use the Services.</strong>
          </p>
          <p>
            If you are entering into these Terms on behalf of a company or other legal entity, you
            represent that you have authority to bind that entity, and &quot;you&quot; refers to that
            entity.
          </p>
        </Section>

        <Section title="2. Who These Terms Cover">
          <p>
            These Terms apply to three overlapping categories of Users. Some provisions apply to
            everyone; others apply only to a specific category, as indicated.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Creators.</strong> Individuals or entities who submit images, video, audio, or
              other media (their &quot;<strong>Content</strong>&quot;) to be watermarked, signed, or
              authenticated by SAIVD. Sections that particularly concern Creators include{" "}
              <strong>Section 5 (Creator Rights and Ownership)</strong> and{" "}
              <strong>Section 6 (License You Grant to SAIVD)</strong>.
            </li>
            <li>
              <strong>Integrators.</strong> Businesses, platforms, and developers who embed the SAIVD
              SDK or call SAIVD APIs to authenticate content within their own products. Integrators
              are additionally bound by <strong>Section 10 (SDK and API Terms for Integrators)</strong>{" "}
              and any separate order form, master services agreement, or developer agreement (each, an
              &quot;<strong>Order</strong>&quot;). Where an Order conflicts with these Terms, the
              Order controls for that Integrator.
            </li>
            <li>
              <strong>Visitors.</strong> Anyone who browses the SAIVD website, scans a SAIVD
              authenticity code, or verifies content without submitting Content or integrating the
              Services. Visitors are bound by the general provisions of these Terms, including{" "}
              <strong>Sections 11–20</strong>.
            </li>
          </ul>
          <p>
            Using the Services in more than one capacity means all applicable sections apply to you
            at once.
          </p>
        </Section>

        <Section title="3. Definitions">
          <p>Capitalized terms have the meanings given where first used or below.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>&quot;Authentication Record&quot;</strong> means the verification data SAIVD
              associates with a piece of Content, which may include the Creator or producer identity,
              credit, capture or submission date, integrity status, and a unique SAIVD identifier.
            </li>
            <li>
              <strong>&quot;Content&quot;</strong> means any media, files, data, or materials you
              submit to, or process through, the Services, including images, video, audio, and
              accompanying metadata.
            </li>
            <li>
              <strong>&quot;Creator Materials&quot;</strong> means your Content together with the
              intellectual property embodied in it.
            </li>
            <li>
              <strong>&quot;SAIVD Technology&quot;</strong> means SAIVD&apos;s proprietary
              watermarking algorithms, source-verification methods, SDK, APIs, models, software, and
              related patents, know-how, and documentation.
            </li>
            <li>
              <strong>&quot;SAIVD Mark&quot;</strong> or <strong>&quot;Watermark&quot;</strong> means
              the invisible, encrypted signal SAIVD embeds in Content, and any associated visible
              badge, glyph, or QR code that signals authenticity.
            </li>
            <li>
              <strong>&quot;Service Analytics&quot;</strong> means aggregated, de-identified,
              statistical, technical, and operational data derived from use of the Services, as
              further described in <strong>Section 8</strong>.
            </li>
            <li>
              <strong>&quot;Verification Output&quot;</strong> means the result returned when Content
              is checked against the Services (for example, &quot;authentic / unaltered,&quot;
              &quot;not recognized,&quot; or an Authentication Record).
            </li>
          </ul>
        </Section>

        <Section title="4. Eligibility and Accounts">
          <p>
            You must be at least 18 years old (or the age of majority in your jurisdiction) and
            legally able to form a binding contract to use the Services. Where an account is
            required, you agree to provide accurate information, keep your credentials confidential,
            and remain responsible for all activity under your account. Notify us promptly at{" "}
            <a href="mailto:info@saivd.io" className="text-blue-500 hover:underline">
              info@saivd.io
            </a>{" "}
            of any unauthorized use. We may suspend or terminate accounts as described in{" "}
            <strong>Section 17</strong>.
          </p>
        </Section>

        <Section title="5. Creator Rights and Ownership">
          <p>
            This Section is central to SAIVD&apos;s promise to Creators.{" "}
            <strong>SAIVD authenticates your work; it does not take it.</strong>
          </p>
          <div className="space-y-2">
            <Subheading>5.1 You retain full ownership.</Subheading>
            <p>
              As between you and SAIVD, you retain all right, title, and interest in and to your
              Creator Materials, including all copyright, trademark, moral rights, rights of
              publicity, neighboring rights, and every other artistic, creative, and commercial right
              you hold in your Content. Submitting Content to the Services, and SAIVD embedding a
              Watermark in it, <strong>transfers no ownership of your Content to SAIVD</strong> and
              grants SAIVD no right to sell, license, sublicense, publish, display, distribute, or
              commercially exploit your Content except as strictly necessary to provide the Services
              to you (see <strong>Section 6</strong>).
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>5.2 The Watermark travels with your work as proof of authorship.</Subheading>
            <p>
              The SAIVD Mark is applied to identify <strong>you</strong> as the source of the
              Content. It is designed to strengthen — never to dilute — your claim of authorship and
              your commercial control over your work. The presence of a SAIVD Mark does not make SAIVD
              a co-author, co-owner, publisher, or licensor of your Content.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>
              5.3 No training of generative or content-reproducing models on your Content.
            </Subheading>
            <p>
              SAIVD will <strong>not</strong> use the substance of your Content to train, fine-tune,
              or develop any generative artificial-intelligence model or any system whose purpose or
              effect is to reproduce, imitate, synthesize, or create derivative expressive works from
              your Content. SAIVD&apos;s learning and improvement rights are limited to Service
              Analytics as defined in <strong>Section 8</strong>, which concern the performance and
              integrity of the authentication technology — not the creative expression in your
              Content. This distinction is a material term of these Terms.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>5.4 Your commercial rights are preserved.</Subheading>
            <p>
              You remain free to license, sell, syndicate, monetize, register (for example, with the
              U.S. Copyright Office), enforce, and otherwise exploit your Content however you choose.
              Nothing in these Terms restricts your ability to do business with your own work, and
              SAIVD claims no royalty, revenue share, or commission on your exploitation of your
              Content unless separately agreed in writing.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>5.5 Attribution and integrity.</Subheading>
            <p>
              Where the Services display an Authentication Record, SAIVD will attribute the Content to
              you (or to the producer/credit you designate) as recorded at submission. SAIVD will not
              knowingly alter the creative substance of your Content; the Watermark is designed to be
              invisible and non-destructive to the work.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>5.6 Your representations.</Subheading>
            <p>
              You represent and warrant that you own or have all necessary rights, licenses, consents,
              and releases to submit your Content and to grant the limited license in{" "}
              <strong>Section 6</strong>, and that your Content and its authentication do not infringe
              or violate any third party&apos;s intellectual-property, privacy, publicity, or other
              rights.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>5.7 Deletion and portability.</Subheading>
            <p>
              You may request deletion of your Content and associated Authentication Records, subject
              to <strong>Section 8.5</strong> and applicable law. Deleting Content from active systems
              does not necessarily invalidate Watermarks already embedded in copies that have left
              SAIVD&apos;s control.
            </p>
          </div>
        </Section>

        <Section title="6. License You Grant to SAIVD">
          <p>
            To provide the Services — and only for that purpose — you grant SAIVD a limited,
            worldwide, non-exclusive, royalty-free, revocable license to host, store, copy, transmit,
            process, watermark, sign, and analyze your Content <strong>solely</strong> to: (a) embed
            and verify the Watermark; (b) generate, store, and display Authentication Records and
            Verification Output to you and to parties who verify your Content; (c) provide, secure,
            and support the Services; and (d) derive Service Analytics under{" "}
            <strong>Section 8</strong>.
          </p>
          <p>
            This license is <strong>purpose-limited</strong>: it does not permit SAIVD to exploit,
            distribute, or commercialize your Content for any independent purpose, and it ends when
            your Content is deleted from SAIVD&apos;s active systems, except (i) for the limited
            retention described in <strong>Section 8.5</strong>, (ii) for Watermarks already embedded
            in distributed copies, and (iii) as required by law. The license is{" "}
            <strong>non-sublicensable</strong> except to SAIVD&apos;s service providers acting on
            SAIVD&apos;s behalf under confidentiality obligations consistent with these Terms.
          </p>
        </Section>

        <Section title="7. Description of the Services">
          <p>
            SAIVD provides technology that verifies and authenticates content at the source. In
            general, Content submitted to a SAIVD-powered platform is processed so that an encrypted,
            invisible Watermark is embedded, binding a Creator or producer identity to the Content.
            On playback or verification, the SDK reads the Watermark and returns Verification Output,
            which may include a scannable code and an Authentication Record.
          </p>
          <p>
            The Services are provided on an &quot;as available&quot; basis and may evolve over time.
            Watermarking and detection technologies are probabilistic and depend on factors outside
            SAIVD&apos;s control (for example, heavy re-encoding, cropping, format conversion, or
            deliberate tampering).{" "}
            <strong>
              SAIVD does not warrant that every Watermark will survive every transformation, that
              every fake will be detected, or that Verification Output will be error-free.
            </strong>{" "}
            Verification Output is provided as a decision-support signal, not as a legal determination
            or guarantee of authenticity, and should not be relied upon as the sole basis for
            high-stakes decisions.
          </p>
        </Section>

        <Section title="8. Service Analytics, Learning, and Continuous Improvement">
          <p>
            SAIVD is a learning system, and improving it protects every Creator on the platform. This
            Section explains the data SAIVD may derive from use of the Services and the limits on it.
          </p>
          <div className="space-y-2">
            <Subheading>8.1 SAIVD&apos;s right to learn and evolve.</Subheading>
            <p>
              You acknowledge and agree that SAIVD may collect, generate, and use{" "}
              <strong>Service Analytics</strong> to operate, secure, evaluate, improve, and evolve the
              Services and the SAIVD Technology — including improving watermark robustness and
              detection accuracy, measuring performance and reliability, diagnosing errors, detecting
              fraud and abuse, understanding usage patterns and demand, developing new features, and
              conducting research and development. This is a core, ongoing right granted to SAIVD
              under these Terms.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>8.2 What Service Analytics includes.</Subheading>
            <p>
              Service Analytics consists of aggregated, de-identified, statistical, technical, and
              operational data, such as: watermark embedding and detection success/failure rates;
              robustness and integrity metrics; latency, throughput, and error logs; device, format,
              resolution, and codec characteristics; volume, frequency, and geographic distribution of
              usage; feature-adoption metrics; and security and anti-abuse signals. Where technically
              feasible, Service Analytics is derived in a form that does not identify you or reproduce
              the expressive substance of your Content.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>8.3 What Service Analytics excludes.</Subheading>
            <p>
              Consistent with <strong>Section 5.3</strong>, Service Analytics does{" "}
              <strong>not</strong> include using the creative or expressive substance of your Content
              to train generative models or to create works that reproduce or imitate your Content.
              SAIVD&apos;s model-improvement activities are directed at the authentication technology
              (for example, making Watermarks more durable and harder to forge), not at reproducing
              Creator expression.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>8.4 Ownership of Service Analytics.</Subheading>
            <p>
              As between the parties, SAIVD owns all Service Analytics and all improvements, models,
              and derived insights resulting from it, provided that Service Analytics does not
              identify you and does not embody the expressive content you own. Nothing in this Section
              transfers ownership of your underlying Creator Materials, which remain yours under{" "}
              <strong>Section 5</strong>.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>8.5 Retention.</Subheading>
            <p>
              SAIVD may retain Service Analytics, Authentication Records, and Watermark verification
              metadata for as long as needed for the purposes above, for the integrity and historical
              verifiability of authenticated Content, and to meet legal, security, and audit
              obligations — including after your Content is otherwise deleted. Retained Authentication
              Records may be necessary so that previously authenticated Content can still be verified.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>8.6 Privacy.</Subheading>
            <p>
              Personal data is handled under the Privacy Policy and applicable data-protection law.
              Where consent or a specific legal basis is required for particular processing, SAIVD
              will obtain or rely on it as required. Integrators are responsible for providing lawful
              notice to, and obtaining any necessary consents from, their own end users.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>8.7 Opt-outs.</Subheading>
            <p>
              [Describe any available opt-out, tier, or enterprise configuration that limits analytics
              — or state that certain operational and security analytics are integral to the Services
              and cannot be disabled without ending the Services.]
            </p>
          </div>
        </Section>

        <Section title="9. Authentication Records and Verification">
          <p>
            Authentication Records reflect information available at the time Content is submitted and
            are intended to help viewers assess provenance. SAIVD does not independently guarantee the
            truth of Creator-supplied identity or credit information. Creators are responsible for the
            accuracy of the identity, credit, and metadata they provide. Verification Output describes
            SAIVD&apos;s assessment of a Watermark&apos;s presence and integrity; it is not a warranty
            about the underlying facts depicted in the Content.
          </p>
        </Section>

        <Section title="10. SDK and API Terms for Integrators">
          <p>
            This Section applies to Integrators in addition to the rest of these Terms and to any
            applicable Order.
          </p>
          <div className="space-y-2">
            <Subheading>10.1 License to the SDK and APIs.</Subheading>
            <p>
              Subject to these Terms, any Order, and payment of applicable fees, SAIVD grants you a
              limited, non-exclusive, non-transferable, non-sublicensable, revocable license to
              integrate and use the SDK and APIs solely to provide content authentication within your
              authorized applications during the term.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>10.2 Restrictions.</Subheading>
            <p>
              You will not, and will not permit others to: (a) copy, modify, or create derivative
              works of the SAIVD Technology except as expressly permitted; (b) reverse engineer,
              decompile, or disassemble the SDK, or attempt to discover, extract, defeat, forge, or
              circumvent the Watermarking algorithms or security measures, except to the limited
              extent applicable law prohibits this restriction; (c) resell, sublicense, or provide the
              Services to third parties except as expressly authorized; (d) remove or obscure
              proprietary notices; (e) exceed documented rate limits or use the APIs to build a
              competing authentication service; or (f) use the Services to enable forgery, spoofing, or
              misrepresentation of authenticity.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>10.3 Integrator responsibilities.</Subheading>
            <p>
              You are responsible for your applications, your end users, lawful notice and consent for
              content you route through the Services, secure handling of credentials and keys, and
              compliance with these Terms by your users. You will indemnify SAIVD as set out in{" "}
              <strong>Section 15</strong> for claims arising from your applications or your users&apos;
              Content.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>10.4 Fees.</Subheading>
            <p>
              Fees, usage tiers, and payment terms are set out in the applicable Order or pricing
              page. Unless stated otherwise, fees are non-refundable and exclusive of taxes. [Confirm
              billing model, overage handling, and taxes.]
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>10.5 Service levels and support.</Subheading>
            <p>
              [Reference any SLA, uptime commitment, and support terms, or state that none apply absent
              a separate written agreement.]
            </p>
          </div>
        </Section>

        <Section title="11. Acceptable Use">
          <p>
            You agree not to use the Services to: violate any law or third-party right; submit Content
            you do not have the rights to; infringe intellectual-property, privacy, or publicity
            rights; upload malware or attempt to compromise the Services&apos; security or integrity;
            forge, spoof, strip, or falsify Watermarks or Authentication Records; misrepresent the
            authenticity, source, or provenance of any content; harass, defame, or harm others; or use
            the Services to create, promote, or launder deceptive synthetic media, disinformation, or
            content that sexualizes minors or otherwise violates law. SAIVD may investigate suspected
            violations and take appropriate action, including removal of Content, suspension,
            termination, and reporting to authorities.
          </p>
        </Section>

        <Section title="12. SAIVD Intellectual Property">
          <p>
            The Services and SAIVD Technology, including all patents, patent applications, software,
            algorithms, models, documentation, designs, the SAIVD name, logos, badges, and other
            trademarks (the &quot;<strong>SAIVD Marks IP</strong>&quot;), are owned by SAIVD or its
            licensors and protected by intellectual-property laws. Except for the limited licenses
            expressly granted in these Terms, SAIVD reserves all rights. You receive no ownership of
            the SAIVD Technology. You may not use the SAIVD Marks IP without prior written permission,
            except to accurately indicate that Content is authenticated through SAIVD in accordance
            with any brand guidelines we provide. If you submit feedback or suggestions, you grant
            SAIVD a perpetual, irrevocable, royalty-free license to use them without restriction or
            obligation to you.
          </p>
        </Section>

        <Section title="13. Third-Party Materials and Links">
          <p>
            The Services may reference or interoperate with third-party platforms, content, or links.
            SAIVD does not control and is not responsible for third-party materials or services, and
            their inclusion does not imply endorsement. Your use of third-party services is governed
            by their terms.
          </p>
        </Section>

        <Section title="14. Disclaimers and Warranties">
          <p className="uppercase">
            THE SERVICES AND ALL VERIFICATION OUTPUT ARE PROVIDED &quot;AS IS&quot; AND &quot;AS
            AVAILABLE,&quot; WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY,
            INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE,
            ACCURACY, AND NON-INFRINGEMENT. SAIVD DOES NOT WARRANT THAT THE SERVICES WILL BE
            UNINTERRUPTED, SECURE, OR ERROR-FREE, THAT WATERMARKS WILL SURVIVE ALL TRANSFORMATIONS, OR
            THAT ALL INAUTHENTIC OR MANIPULATED CONTENT WILL BE DETECTED. VERIFICATION OUTPUT IS A
            DECISION-SUPPORT SIGNAL AND NOT A GUARANTEE, CERTIFICATION, OR LEGAL DETERMINATION OF
            AUTHENTICITY. SOME JURISDICTIONS DO NOT ALLOW CERTAIN WARRANTY EXCLUSIONS, SO SOME OF THE
            ABOVE MAY NOT APPLY TO YOU.
          </p>
        </Section>

        <Section title="15. Limitation of Liability">
          <p className="uppercase">
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, SAIVD AND ITS OFFICERS, DIRECTORS, EMPLOYEES, AND
            AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
            EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS
            INTERRUPTION, ARISING OUT OF OR RELATED TO THE SERVICES OR THESE TERMS, EVEN IF ADVISED OF
            THE POSSIBILITY OF SUCH DAMAGES. SAIVD&apos;S TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS
            ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICES WILL NOT EXCEED THE GREATER OF
            (A) THE AMOUNTS YOU PAID TO SAIVD FOR THE SERVICES IN THE [TWELVE (12) MONTHS] PRECEDING
            THE EVENT GIVING RISE TO THE CLAIM, OR (B) [ONE HUNDRED U.S. DOLLARS (US$100)]. THESE
            LIMITATIONS APPLY REGARDLESS OF THE THEORY OF LIABILITY AND ARE A FUNDAMENTAL BASIS OF
            THE BARGAIN. SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS, SO SOME OF THE ABOVE MAY
            NOT APPLY TO YOU.
          </p>
        </Section>

        <Section title="16. Indemnification">
          <p>
            You will defend, indemnify, and hold harmless SAIVD and its affiliates and their
            respective officers, directors, employees, and agents from and against any claims,
            damages, liabilities, losses, and expenses (including reasonable attorneys&apos; fees)
            arising out of or related to: (a) your Content or Creator Materials; (b) your use of the
            Services; (c) your violation of these Terms or applicable law; (d) your infringement or
            violation of any third-party right; and, for Integrators, (e) your applications and your
            end users&apos; use of the Services.
          </p>
        </Section>

        <Section title="17. Term, Suspension, and Termination">
          <p>
            These Terms apply while you use the Services. You may stop using the Services at any time.
            SAIVD may suspend or terminate your access, with or without notice, if you breach these
            Terms, create risk or legal exposure, or if SAIVD discontinues the Services. On
            termination, the licenses granted to you end, and you must stop using the Services and
            (for Integrators) remove the SDK from your applications. Provisions that by their nature
            should survive — including{" "}
            <strong>Sections 5, 8.4, 8.5, 12, 14, 15, 16, 18, and 20</strong> — survive termination.
            Termination does not invalidate Watermarks already embedded in distributed copies of
            Content.
          </p>
        </Section>

        <Section title="18. Governing Law and Dispute Resolution">
          <div className="space-y-2">
            <Subheading>18.1 Governing law.</Subheading>
            <p>
              These Terms are governed by the laws of the State of New York, and applicable U.S.
              federal law, without regard to conflict-of-laws rules.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>18.2 Forum.</Subheading>
            <p>
              Subject to <strong>Section 18.3</strong>, the state and federal courts located in New
              York County, New York have exclusive jurisdiction, and you consent to personal
              jurisdiction and venue there.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>18.3 [Optional — Arbitration / class-action waiver.]</Subheading>
            <p>
              [If SAIVD elects binding arbitration and a class-action waiver, insert the arbitration
              clause, administrator/rules, seat, opt-out mechanism, and any consumer-specific
              carve-outs here. Arbitration and class-waiver terms are heavily regulated and vary by
              jurisdiction; have counsel draft this Section.]
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>18.4 Time to bring claims.</Subheading>
            <p>
              [Any claim must be brought within [ONE (1) YEAR] of accrual, where permitted by law.]
            </p>
          </div>
        </Section>

        <Section title="19. Changes to the Services and These Terms">
          <p>
            SAIVD may modify the Services and these Terms from time to time. When we make material
            changes to these Terms, we will update the &quot;Last Updated&quot; date and provide notice
            by reasonable means (for example, posting on the website or notifying account holders).
            Changes are effective when posted unless stated otherwise. Your continued use of the
            Services after changes take effect constitutes acceptance. If you do not agree, stop using
            the Services.
          </p>
        </Section>

        <Section title="20. General">
          <div className="space-y-2">
            <Subheading>20.1 Entire agreement.</Subheading>
            <p>
              These Terms, the Privacy Policy, and any applicable Order constitute the entire agreement
              between you and SAIVD regarding the Services and supersede prior agreements on that
              subject.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>20.2 Severability.</Subheading>
            <p>
              If any provision is held unenforceable, the remaining provisions remain in effect, and
              the unenforceable provision will be modified to the minimum extent necessary to make it
              enforceable.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>20.3 No waiver.</Subheading>
            <p>Failure to enforce any provision is not a waiver of it.</p>
          </div>
          <div className="space-y-2">
            <Subheading>20.4 Assignment.</Subheading>
            <p>
              You may not assign these Terms without SAIVD&apos;s prior written consent. SAIVD may
              assign these Terms in connection with a merger, acquisition, reorganization, or sale of
              assets.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>20.5 Force majeure.</Subheading>
            <p>
              SAIVD is not liable for delays or failures caused by events beyond its reasonable
              control.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>20.6 Relationship.</Subheading>
            <p>
              The parties are independent contractors; these Terms create no partnership, agency, or
              employment relationship.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>20.7 Notices.</Subheading>
            <p>
              Legal notices to SAIVD should be sent to{" "}
              <a href="mailto:info@saivd.io" className="text-blue-500 hover:underline">
                info@saivd.io
              </a>
              .
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>20.8 Export and sanctions compliance.</Subheading>
            <p>
              You represent that you are not located in, and will not use the Services in violation of,
              applicable export-control or sanctions laws.
            </p>
          </div>
          <div className="space-y-2">
            <Subheading>20.9 Headings.</Subheading>
            <p>Headings are for convenience only and do not affect interpretation.</p>
          </div>
        </Section>

        <Section title="21. Contact">
          <p>Questions about these Terms:</p>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Saivd, Inc.</p>
            <p>
              Email:{" "}
              <a href="mailto:info@saivd.io" className="text-blue-500 hover:underline">
                info@saivd.io
              </a>
            </p>
            <p>
              Web:{" "}
              <a
                href="https://www.saivd.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                https://www.saivd.io
              </a>
            </p>
          </div>
        </Section>

        <footer className="space-y-4 border-t border-border pt-6 text-sm text-muted-foreground">
          <p>© 2026 Saivd, Inc. All rights reserved.</p>
          <Link href="/register" className="inline-block text-blue-500 hover:underline">
            ← Back to registration
          </Link>
        </footer>
      </div>
    </div>
  );
}
