# -*- coding: utf-8 -*-
"""Enrich /winterthur/kurse/* (DE) with real Webflow CMS content. Run AFTER generate_site."""
import re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import generate_site as G  # regenerates skeletons (idempotent), gives us page()/chapter()/T

def rt(s):
    if not s: return ''
    s = s.replace(' id=""','').replace('\u200d','')
    s = re.sub(r'<p>\s*</p>','',s)
    return s

C = {}
C['personal-training'] = dict(
 sub="1:1 Training für deinen Weg – intensiv, persönlich, effektiv.",
 rt_sub="<p>Du willst schneller vorankommen, gezielter trainieren und genau da ansetzen, wo es dir am meisten bringt?</p><p>Im Personal Training bei IMPACT bekommst du volle Aufmerksamkeit, echte Verbindung – und ein Training, das so individuell ist wie du selbst.</p><p>Ob Technik, Fitness oder mentale Stärke – du bestimmst den Fokus, wir bringen dich weiter.</p>",
 what_h="Was ist Personal Training – und was bringt es dir?",
 rt_what="<h3>Hier geht’s nicht um Standardlösungen.</h3><p>Sondern um Training, das dich versteht.</p><p>Du entscheidest, wohin die Reise geht – wir entwickeln mit dir die Route:</p><p>– Krav Maga, MMA, Boxen, Fitness oder alles kombiniert</p><p>– Präzise Technik, funktionelle Stärke oder mentale Resilienz</p><p>– Ganz ruhig oder maximal fordernd – angepasst an dich</p>",
 learn=["Ungeteilte Aufmerksamkeit, direktes Feedback und schnellere Fortschritte, weil du keine Zeit verlierst","Neue Routinen, besseres Körpergefühl und mentale Klarheit","Eine starke Trainer-Bindung – respektvoll, echt und motivierend"],
 quote="Dein Coach kennt deinen Rhythmus – und erkennt dein Potenzial oft noch vor dir selbst.",
 why_rt="<p>Weil wir Personal Training nicht als Luxus sehen – sondern als <strong>eine der stärksten Formen, dich weiterzuentwickeln</strong>.</p><p>Unsere erfahrenen Coaches bringen dich in Bewegung, ohne dich zu überfordern – und fordern dich heraus, ohne zu überziehen.</p>",
 why_pts=["Ehrliche Arbeit an deinen Zielen – mit Plan und Struktur","Persönliche Bindung zu deinem Trainer, was dein Training auf ein neues Level hebt","Expertise aus Kampfkunst, Fitness und Coaching – fokussiert auf dich"],
 why_rt2="", special_h="Dein Einstieg",
 special_rt="<h4>WERDE STÄRKER – KÖRPERLICH UND MENTAL.</h4><p>Trainiere mit Klarheit, ohne Ablenkung, in deinem Tempo.</p><p>Erlebe Fortschritt, der sich nicht nur im Spiegel zeigt – sondern in deiner Haltung, deiner Energie und deinem Leben.</p><h5>Probier’s aus – ganz ohne Druck. Wir freuen uns auf dich.</h5>",
 faq=[("Ist es schwer zu lernen?","Die 1:1-Unterrichtsstunden sind für jede/n geeignet, der sportlich fit ist und in sich selbst investieren möchte. Der Inhalt kann von allen erlernt werden."),
      ("Wie läuft das Training ab?","Die 1:1-Unterrichtsstunden konzentrieren sich darauf, deine Fitness zu verbessern und dich stärker zu machen. Dies beinhaltet Übungen, die dich herausfordern und aus deiner Komfortzone herausholen werden. Alles in kleinen Schritten und absolut sicher."),
      ("Wie melde ich mich an?","Melde dich einfach über das Formular an. Du kannst kostenlos kommen, um uns und den Unterricht kennenzulernen – wir rufen dich vorher kurz an.")],
 img="https://cdn.prod.website-files.com/651f0961164dd76d2ce8fd62/69d67781ecae1402d0ab8d7d_Class%20Thumbnail%20%20Resize%20%20(2).jpg")

C['selbstverteidigung-fuer-frauen'] = dict(
 sub="Lerne, dich zu verteidigen – klar, direkt und realitätsnah.",
 rt_sub="<p>Du willst dich sicherer fühlen – in deinem Alltag, auf dem Heimweg oder in unklaren Situationen?</p><p>Bei IMPACT lernst du, dich zu behaupten: gegen Griffe, Übergriffe, Schläge oder Belästigung.</p><p>In unseren Frauenklassen trainierst du zuerst mit anderen Frauen – in einem sicheren Rahmen, der dich nicht überfordert, aber ehrlich vorbereitet.</p><p>Mit der Zeit wirst du stärker – körperlich und mental. Schritt für Schritt, in deinem Tempo.</p>",
 what_h="Was ist Selbstverteidigung für Frauen – und was bringt es dir?",
 rt_what="<p>Unser Selbstverteidigungstraining für Frauen ist keine Fitness-Spielerei.</p><p>Es ist funktionale Selbstverteidigung für Frauen – direkt, klar und an echten Situationen orientiert.</p><p>Du trainierst:</p><ul><li>Befreiungstechniken bei Festhalten oder Griffen</li><li>Reaktion auf körperliche und verbale Übergriffe</li><li>Umgang mit Stress, Angst und Überraschung</li><li>Klarheit in Körpersprache und Auftreten</li></ul>",
 learn=["Echte Selbstsicherheit – nicht gespielt, sondern erarbeitet","Die Fähigkeit, Grenzen zu setzen – verbal und körperlich","Ein neues Gefühl von Kontrolle über deinen Alltag"],
 quote="Unser Training macht dich nicht unangreifbar – aber es zeigt dir, dass du nicht hilflos bist.",
 why_rt="<p>Weil wir wissen, wie man Stärke aufbaut – ohne Angst zu machen.</p><p>Und weil wir dir Raum geben, dich in deinem Tempo weiterzuentwickeln.</p><p>Unsere erfahrenen Coaches leiten das Training strukturiert und respektvoll – mit viel Fokus auf Sicherheit, Klarheit und Realität.</p>",
 why_pts=["Einstiegstrainings nur mit Frauen – für Vertrauen und Ruhe","Klare Techniken, echte Szenarien, kein Showtraining","Ein geschützter Raum, in dem du wachsen kannst – ohne Bewertung"],
 why_rt2="", special_h="Dein Einstieg",
 special_rt="<h4>WERDE STÄRKER – KÖRPERLICH UND MENTAL.</h4><p>Gewinne echtes Selbstvertrauen in deine Fähigkeit, dich zu verteidigen.</p><p>Mach den Kopf frei. Fühl dich besser – in deinem Körper und in deinem Leben.</p><h5>Probier’s aus – ganz ohne Druck. Wir freuen uns auf dich.</h5>",
 faq=[("Passe ich dazu?","Die Stunden sind für alle Frauen und Menschen aus der LGBT+ Community geeignet, und der Inhalt kann von jeder erlernt werden."),
      ("Wie hart ist das Training?","Der Fokus liegt darauf, deine Fitness zu verbessern und dich stärker zu machen – mit Übungen, die dich fordern, aber in kleinen Schritten und absolut sicher."),
      ("Wie melde ich mich an?","Melde dich einfach über das Formular an. Du kannst kostenlos kommen, um uns und den Unterricht kennenzulernen – wir rufen dich vorher kurz an.")],
 img="https://cdn.prod.website-files.com/651f0961164dd76d2ce8fd62/69d676210e3c8fca8fdc8b08_Class%20Thumbnail%20%20Resize%20.jpg")

C['mma'] = dict(
 sub="Lern MMA – mit Technik, mit Kontrolle. In sicherer Umgebung.",
 rt_sub="<p>Bei <strong>IMPACT</strong> bekommst du strukturiertes MMA-Training – geführt von Coaches mit echter Profi-Kampferfahrung.</p><p>Du entscheidest, wie weit du gehen willst. Wir begleiten dich.</p>",
 what_h="Was ist MMA – und was bringt es dir?",
 rt_what="<h4>MMA verbindet vier Kampfsportarten zu einer:</h4><ul><li><strong>Boxen</strong> – für Schläge und Distanz</li><li><strong>Muay Thai</strong> – für Kicks, Knie, Ellbogen und Clinch</li><li><strong>Ringen</strong> – für Takedowns und Kontrolle</li><li><strong>Brazilian Jiu-Jitsu</strong> – für Bodenkampf und Aufgabegriffe</li></ul><p>Bei <strong>IMPACT</strong> lernst du, wie du diese Disziplinen effektiv kombinierst. Vom Stand bis zum Boden – alles greift ineinander.</p>",
 learn=["Körperliche Fitness","Technisches Verständnis","Selbstvertrauen in jeder Situation"],
 quote="MMA bei IMPACT ist fordernd – aber du bestimmst das Tempo. Kein Druck. Kein Vergleich. Nur dein Fortschritt zählt.",
 why_rt="<p>Weil wir MMA zugänglich machen – <strong>ohne falsches Ego-Gehabe.</strong> Weil wir wissen, <strong>wie man sauber unterrichtet.</strong> Und weil wir wollen, dass du dich wohl fühlst, während du lernst.</p>",
 why_pts=["Top Coaches mit MMA-Profi-Erfahrung","Klare Strukturen im Training","Zugang zu allen relevanten Disziplinen","Eine Community, die dich auf Augenhöhe unterstützt"],
 why_rt2="Du musst nichts beweisen. Aber du kannst hier viel erreichen.",
 special_h="Dein Einstieg",
 special_rt="<p>Ob du fitter werden willst, im Sparring lernen oder irgendwann Wettkämpfe machen willst: Bei <strong>IMPACT</strong> ist Platz für dein Ziel.</p><h3>Was du lernst:</h3><ul><li><strong>Präzises Schlagen</strong></li><li><strong>Kontrolle im Clinch</strong></li><li><strong>Bodenkampf mit System</strong></li><li><strong>Übergänge zwischen allen Ebenen</strong></li></ul><h5>Sparring ist freiwillig – und immer sicher. Du entscheidest, wann du bereit bist.</h5>",
 faq=[("Ist MMA schwer zu lernen?","Die MMA-Lektionen sind etwas fortgeschrittener, aber für alle geeignet, die sportlich sind. Der Inhalt kann von jedem erlernt werden."),
      ("Muss ich sparren?","Sparring ist freiwillig und streng kontrolliert – es gibt klare Regeln, und der Kopf wird nicht hart getroffen. Wir legen grössten Wert darauf, uns nicht gegenseitig zu verletzen."),
      ("Passe ich dazu?","Wir sind stolz auf eine grossartige Gemeinschaft sehr unterschiedlicher Menschen, die jeden willkommen heisst. Auch du passt gut zu uns!"),
      ("Wie melde ich mich an?","Melde dich einfach über das Formular an. Du kannst kostenlos kommen – wir rufen dich vorher kurz an.")],
 img="https://cdn.prod.website-files.com/651f0961164dd76d2ce8fd62/69d675af6e28c4058f4fa1b3_Untitled%20design%20(1).jpg")

C['fitness-kickboxen'] = dict(
 sub="Power. Technik. Spass. Dein neues Lieblings-Workout.",
 rt_sub="<p>Fitness Kickboxen bei IMPACT bringt dich auf ein neues Level – körperlich wie mental.</p><p>Du verbesserst deine Ausdauer, baust Kraft auf, lässt den Alltagsstress hinter dir – und ganz nebenbei lernst du echte Kickbox-Technik.</p><p>Trainiert wird mit Partner, aber ohne Sparring. Mit Energie, Musik und Respekt.</p>",
 what_h="Was ist Fitness Kickboxen – und was bringt es dir?",
 rt_what="<h3>Fitness Kickboxen ist mehr als nur Bewegung.</h3><p>Es ist dein Ventil, dein Energie-Boost, dein Körpergefühl – in einem Training. Du bewegst dich wie ein Fighter – aber ohne Schläge ins Gesicht.</p><p>Du trainierst:</p><ul><li>Schlag- und Kick-Kombos an Pratzen &amp; Pads</li><li>Dynamische Partnerübungen für Koordination &amp; Timing</li><li>Kraft &amp; Ausdauer mit funktionellem Bodyweight-Training</li><li>Technik, die Spass macht – ohne Kampf, aber mit echtem Impact</li></ul>",
 learn=["Ein starkes Herz, ein fitter Körper, ein klarer Kopf","Mehr Körperspannung, bessere Haltung, neues Selbstbewusstsein","Positives Miteinander – ohne Vergleiche, ohne Ego"],
 quote="Fitness Kickboxen ist dein Weg zu mehr Energie – und vielleicht zu deiner besten Version.",
 why_rt="<p>Weil wir wissen, wie man Training so gestaltet, dass es dich wirklich weiterbringt.</p><p>Mit motivierender Musik, top Coaches und einer Community, die dich mitzieht – nicht bewertet.</p>",
 why_pts=["Kickbox-Technik für jedes Level – direkt und verständlich","Klar strukturierte Workouts mit Fokus auf Fortschritt","Partnertraining ohne Druck – mit Respekt und Spass"],
 why_rt2="Hier musst du nicht kämpfen – aber du darfst kämpfen, um besser zu werden.",
 special_h="Dein Einstieg",
 special_rt="<h4>WERDE STÄRKER – KÖRPERLICH UND MENTAL.</h4><p>Trainiere für dich – mit anderen. Lern deinen Körper kennen. Finde deinen Rhythmus.</p><p>Und erleb, wie gut es sich anfühlt, wenn dein Training dich wirklich weiterbringt.</p><h5>Probier’s aus – ganz ohne Druck. Wir freuen uns auf dich.</h5>",
 faq=[("Ist es schwer zu lernen?","Die Unterrichtsstunden sind für jeden geeignet, und der Inhalt kann von jedem erlernt werden."),
      ("Muss ich kämpfen?","Nein. Die Fitness-Kickbox-Lektionen konzentrieren sich auf deine Fitness und nicht aufs Kämpfen. Wir machen kein Sparring und treffen nur die Pratzen."),
      ("Passe ich dazu?","Wir sind stolz auf eine grossartige Gemeinschaft sehr unterschiedlicher Menschen. Jeder passt hier rein."),
      ("Wie melde ich mich an?","Melde dich einfach über das Formular an. Du kannst kostenlos kommen – wir rufen dich vorher kurz an.")],
 img="https://cdn.prod.website-files.com/651f0961164dd76d2ce8fd62/69d6768f0f51633584b0b07e_Class%20Thumbnail%20%20Resize%20%20(1).jpg")

C['ringen'] = dict(
 sub="Ringen lernen – kraftvoll, technisch, mit absoluter Kontrolle.",
 rt_sub="<p>Ringen ist die härteste Kampfkunst der Welt – und der Schlüssel zu echtem Kampferfolg.</p><p>Bei <strong>IMPACT</strong> lernst du, wie du Gegner zu Boden bringst, sie kontrollierst und körperlich dominierst.</p><p>Du entwickelst Kraft, Ausdauer und mentale Stabilität – in einem respektvollen und fordernden Umfeld.</p>",
 what_h="Was ist Ringen – und was bringt es dir?",
 rt_what="<p>Ringen ist kompromisslos. Kein Schlag, kein Showeffekt – nur dein Körper gegen den anderen.</p><p>Es geht um Maximalkraft, Explosivität, Timing und puren Willen. Wer das Ringen dominiert, bestimmt, wo der Kampf stattfindet – im MMA, in der Selbstverteidigung, auf der Matte.</p><p>Bei <strong>IMPACT</strong> lernst du:</p><ul><li>Takedowns, Würfe und Clinch-Arbeit</li><li>Haltepositionen und Boden-Kontrolle</li><li>Befreiungstechniken und Reversals</li><li>Explosives Krafttraining direkt auf der Matte</li></ul>",
 learn=["Maximalkraft, Körperspannung und funktionale Power","Kontrolle über andere – und über dich selbst","Ein unerschütterliches Körpergefühl und Ruhe unter Druck"],
 quote="Ringen ist körperlich extrem – aber klar strukturiert. Wer es meistert, wird stärker als fast jede andere Form des Trainings es erlaubt.",
 why_rt="<p>Weil wir dir zeigen, wie man sauber, effektiv und sicher ringt – egal, wo du startest.</p><p>Unser Wrestling-Coach <strong>Laszlo Simo</strong> bringt über zwölf Jahre Bundesliga-Erfahrung mit – als mehrfacher ungarischer und rumänischer Meister.</p><p>Er steht für Werte wie Ausdauer, Demut und Respekt – und formt seine Schüler auf höchstem Niveau.</p>",
 why_pts=[], why_rt2="", special_h="Dein Einstieg",
 special_rt="<h4>WERDE STÄRKER – KÖRPERLICH UND MENTAL.</h4><p>Gewinne echtes Selbstvertrauen in deine Ringer-Fähigkeiten.</p><p>Mach den Kopf frei. Fühl dich besser – in deinem Körper und in deinem Leben.</p><h5>Probier’s aus – ganz ohne Druck. Wir freuen uns auf dich.</h5>",
 faq=[("Ist Ringen schwer zu lernen?","Die Ringen-Lektionen sind etwas fortgeschrittener, aber für alle geeignet, die sportlich sind. Der Inhalt kann von jedem erlernt werden."),
      ("Wie hart ist das Training?","Fordernd, aber kontrolliert – es gibt klare Regeln, und wir legen grössten Wert darauf, uns nicht gegenseitig zu verletzen."),
      ("Passe ich dazu?","Wir sind stolz auf eine grossartige Gemeinschaft sehr unterschiedlicher Menschen, die jeden willkommen heisst. Auch du passt gut zu uns!"),
      ("Wie melde ich mich an?","Melde dich einfach über das Formular an. Du kannst kostenlos kommen – wir rufen dich vorher kurz an.")],
 img="https://cdn.prod.website-files.com/651f0961164dd76d2ce8fd62/6a3584def047454b35f4b467_IMPACT%20Website%20(22).png")

C['muay-thai'] = dict(
 sub="Muay Thai lernen – kraftvoll, technisch, mit Respekt.",
 rt_sub="<p>Muay Thai ist die traditionelle Kampfkunst Thailands – präzise, effektiv und körperlich fordernd.</p><p>Bei <strong>IMPACT</strong> trainierst du authentisches Muay Thai mit Fokus auf Technik, Körpergefühl und Kontrolle.</p><p>Du entwickelst Kraft, Beweglichkeit und Selbstvertrauen – Schritt für Schritt, in deinem Tempo.</p>",
 what_h="Was ist Muay Thai – und was bringt es dir?",
 rt_what="<p>Muay Thai wird die <strong>„Kunst der acht Gliedmassen“</strong> genannt – weil Fäuste, Ellbogen, Knie und Schienbeine gezielt eingesetzt werden.</p><p>Es ist kraftvoll und direkt – aber auch rhythmisch, fliessend und elegant in seiner Bewegung.</p><p><strong>Du lernst:</strong></p><ul><li>Schlagtechniken mit Fäusten, Ellbogen, Knien und Schienbeinen</li><li>Clinch-Kontrolle für Dominanz in der Nahdistanz</li><li>Hohe Kicks und Fussarbeit für Flexibilität und Präzision</li><li>Verteidigung und Konter mit Timing und Übersicht</li><li>Funktionelles Thai-Training für Kraft, Ausdauer und Beweglichkeit</li></ul>",
 learn=["Effektive Tools für echte Selbstverteidigung","Spürbare Körperbeherrschung, Koordination und mentale Ruhe","Selbstvertrauen – durch echte Skills, nicht Show"],
 quote="",
 why_rt="<p>Weil wir dich ernst nehmen – egal, wo du startest.</p><p>Bei uns bekommst du echtes Muay Thai – strukturiert, motivierend und angepasst auf dein Level.</p><p>Ohne Ego. Ohne Druck. Mit Fokus auf Fortschritt.</p>",
 why_pts=["Top Coaches mit Praxiserfahrung im Muay Thai","Klar aufgebaute Trainingsinhalte","Eine Community, die dich unterstützt – nicht vergleicht"],
 why_rt2="", special_h="Dein Einstieg",
 special_rt="<h4>WERDE STÄRKER – KÖRPERLICH UND MENTAL.</h4><p>Gewinne echtes Selbstvertrauen in deine Muay-Thai-Fähigkeiten.</p><p>Mach den Kopf frei. Fühl dich besser – in deinem Körper und in deinem Leben.</p><h5>Probier’s aus – ganz ohne Druck. Wir freuen uns auf dich.</h5>",
 faq=[("Ist Muay Thai zu hart für mich?","Nein. Jede Übung lässt sich an dein Level anpassen und du bestimmst dein Tempo. Die Lektionen sind fordernd, aber für alle machbar, die sich bewegen wollen."),
      ("Muss ich sparren?","Nein. Sparring ist freiwillig und streng kontrolliert – der Kopf wird nicht hart getroffen. Wir legen grössten Wert darauf, uns nicht gegenseitig zu verletzen."),
      ("Passe ich dazu?","Wir sind stolz auf eine grossartige Gemeinschaft sehr unterschiedlicher Menschen, die jeden willkommen heisst. Auch du passt gut zu uns!"),
      ("Wie melde ich mich an?","Melde dich einfach über das Formular an. Du kannst kostenlos kommen – wir rufen dich vorher kurz an.")],
 img="https://cdn.prod.website-files.com/651f0961164dd76d2ce8fd62/69d6786df4721d12fb7282ac_Class%20Thumbnail%20%20Resize%20%20(5).jpg")

C['boxen'] = dict(
 sub="Boxen lernen – mit Power, Technik und Struktur.",
 rt_sub="<p>Egal ob du neu einsteigst oder besser werden willst – bei <strong>IMPACT</strong> bekommst du echtes Boxtraining.</p><p>Du arbeitest an deiner Technik, deiner Fitness und deinem Selbstvertrauen. In einem Umfeld, das fordert, aber nicht überfordert.</p>",
 what_h="Was ist Boxen – und was bringt es dir?",
 rt_what="<p>Boxen ist mehr als Schläge und Pratzen. Es ist Timing, Präzision, Beweglichkeit – und eine mentale Challenge.</p><p>Bei <strong>IMPACT</strong> lernst du:</p><ul><li>Jabs, Haken, Uppercuts, Blocks &amp; Konter</li><li>Beinarbeit für Beweglichkeit und Balance</li><li>Schlagkraft mit Technik</li><li>Sparring, wenn du soweit bist – sicher und klar geführt</li></ul>",
 learn=["Spürbare Fitness, bessere Koordination und starke Ausdauer","Klare Reaktion unter Druck","Mehr Selbstvertrauen – durch Können, nicht durch Show"],
 quote="",
 why_rt="<p>Weil du bei uns nicht einfach „eine Stunde boxst“.</p><p>Du trainierst mit Plan, in einer Community, die dich mitzieht – egal wo du stehst.</p>",
 why_pts=["Top Coaches mit echter Kampferfahrung","Klar strukturierter Unterricht für jedes Level","Eine respektvolle Trainingskultur ohne Ego"],
 why_rt2="Du musst nicht kämpfen wollen – aber du wirst lernen, wie’s geht.",
 special_h="Dein Einstieg",
 special_rt="<h4>WERDE STÄRKER – KÖRPERLICH UND MENTAL.</h4><p>Gewinne echtes Selbstvertrauen in deine Fähigkeiten. Mach den Kopf frei. Fühl dich besser – in deinem Körper und in deinem Leben.</p><p>Trainiere in einem Umfeld, das dich <strong>unterstützt</strong>, nicht <strong>bewertet</strong>.</p><h5>Probier’s aus – ganz ohne Druck. Wir freuen uns auf dich.</h5>",
 faq=[("Ist Boxen schwer zu lernen?","Die Boxen-Lektionen sind etwas fortgeschrittener, aber für alle geeignet, die sportlich sind. Der Inhalt kann von jedem erlernt werden."),
      ("Muss ich sparren?","Nein. Sparring ist freiwillig und streng kontrolliert – der Kopf wird nicht hart getroffen. Wir legen grössten Wert darauf, uns nicht gegenseitig zu verletzen."),
      ("Passe ich dazu?","Wir sind stolz auf eine grossartige Gemeinschaft sehr unterschiedlicher Menschen, die jeden willkommen heisst. Auch du passt gut zu uns!"),
      ("Wie melde ich mich an?","Melde dich einfach über das Formular an. Du kannst kostenlos kommen – wir rufen dich vorher kurz an.")],
 img="https://cdn.prod.website-files.com/651f0961164dd76d2ce8fd62/69d677fcda06ef6177219a4e_Class%20Thumbnail%20%20Resize%20%20(3).jpg")

C['bjj'] = dict(
 sub="Brazilian Jiu-Jitsu bei IMPACT – Kontrolle. Fokus. Flow.",
 rt_sub="<p>Entdecke die Kunst, deinen Körper und deinen Geist zu beherrschen.</p><p>Ob zur Selbstverteidigung, zum Auspowern oder zur mentalen Stärke – BJJ ist mehr als Sport.</p>",
 what_h="Was ist BJJ?",
 rt_what="<p><strong>Brazilian Jiu-Jitsu</strong> ist der Kampfsport, der dir zeigt, wie du mit <strong>Technik statt Kraft</strong> gewinnen kannst.</p><p>Du lernst, wie du in jeder Situation ruhig bleibst, deinen Gegner kontrollierst – und dabei deine eigene Stärke entdeckst.</p><p><strong>Kein Ego.</strong> Nur du, dein Körper, dein Kopf – und jede Menge Aha-Momente.</p>",
 learn=["Sicher, weil es ohne Schläge funktioniert","Smart, weil es um Kontrolle und Taktik geht","Ehrlich, weil du auf der Matte nichts verstecken kannst"],
 quote="Jede Lektion bringt dir mehr als Technik – sie gibt dir Fokus, Selbstvertrauen und Klarheit. Auf und neben der Matte.",
 why_rt="<p>Bei uns geht’s nicht darum, der Härteste im Raum zu sein – sondern der, der am meisten lernt.</p>",
 why_pts=["Top Level Black Belt Trainer, der dich wirklich begleitet","Eine Gemeinschaft, die dich trägt, fördert und fordert","Zugang zu anderen Trainings: BJJ, MMA, Thaiboxen","Flexible Zeiten &amp; Einsteigerfreundlichkeit"],
 why_rt2="Du brauchst keine Vorkenntnisse – nur Neugier und Lust, etwas Neues zu probieren. Bei uns bist du willkommen.",
 special_h="Dein Weg – mit oder ohne Gi",
 special_rt="<h3>BJJ mit Gi:</h3><ul><li>Traditionell, technisch, mit Griffen am Stoff</li><li>Mit Gürtel-System</li><li>Strukturiert, fokussiert, tief</li></ul><h3>BJJ ohne Gi (NoGi):</h3><ul><li>Dynamisch, körpernah</li><li>Ohne schwere Kleidung – pure Kontrolle</li><li>Besonders beliebt bei sportlichen Allroundern &amp; MMA-Fans</li></ul><h5>Du musst dich nicht sofort entscheiden. Probier beides aus und finde deinen Stil.</h5>",
 faq=[("Ist BJJ schwer zu lernen?","Die BJJ-Lektionen sind etwas fortgeschrittener, aber für alle geeignet, die sportlich sind. Der Inhalt kann von jedem erlernt werden."),
      ("Muss ich sparren (rollen)?","Sparring ist kontrolliert und sicher – es gibt klare Regeln, und wir legen grössten Wert darauf, uns nicht gegenseitig zu verletzen."),
      ("Passe ich dazu?","Wir sind stolz auf eine grossartige Gemeinschaft sehr unterschiedlicher Menschen, die jeden willkommen heisst. Auch du passt gut zu uns!"),
      ("Wie melde ich mich an?","Melde dich einfach über das Formular an. Du kannst kostenlos kommen – wir rufen dich vorher kurz an.")],
 img="https://cdn.prod.website-files.com/651f0961164dd76d2ce8fd62/69d6795b769f05589695c57e_Class%20Thumbnail%20%20Resize%20%20(8).jpg")

C['street-defense'] = dict(
 sub="Lerne zu kämpfen für echte Situationen auf der Strasse – direkt, effektiv, basierend auf modernem MMA-Training.",
 rt_sub="<p>Du hast Angst, in eine gefährliche Situation zu geraten? Oder hast schon Gewalt erlebt?</p><p>Bei IMPACT lernst du, zu kämpfen und dich zu verteidigen – gegen Schläge, Griffe, und was du tun kannst, wenn du am Boden bist.</p><p><strong>Unser Street Defense</strong> gibt dir Kraft, Klarheit und Handlungssicherheit – wenn’s wirklich zählt.</p>",
 what_h="Was ist unser Street Defense – und was bringt es dir?",
 rt_what="<p>Wir unterrichten das effektivste Selbstverteidigungssystem, basierend auf MMA – weiterentwickelt für echte Gefahrensituationen der Strasse, nicht für Wettkämpfe.</p><p>Du lernst, mit Angriffen umzugehen:</p><ul><li>Im Stand oder am Boden</li><li>Gegen Schläge und Griffe</li><li>Unter Druck, mit Adrenalin, im Chaos</li></ul>",
 learn=["Du wirst stressresistenter, klarer im Kopf und entschlossener","Du lernst, unter Druck zu kämpfen und nicht einzufrieren","Du stärkst nicht nur deinen Körper – sondern auch deine Haltung im Leben"],
 quote="Unser Street Defense zeigt dir: Du kannst kämpfen und dich verteidigen. Du kannst mehr, als du glaubst.",
 why_rt="<p>Weil wir nicht realitätsfern unterrichten – sondern mit Plan, Klarheit und Verantwortung.</p><p>Unsere Coaches bringen Erfahrung aus Kampfsport, Sicherheitsarbeit und echten Bedrohungsszenarien mit.</p>",
 why_pts=["Top Trainer mit Zertifizierung und langjähriger Erfahrung","Klar strukturierte Einheiten mit positiver Energie","Eine unterstützende Gruppe, die sich gemeinsam entwickelt – ohne Druck, ohne Urteil"],
 why_rt2="", special_h="Dein Einstieg",
 special_rt="<h4>WERDE STÄRKER – KÖRPERLICH UND MENTAL.</h4><p>Gewinne echtes Selbstvertrauen in deine Fähigkeit, dich zu verteidigen.</p><p>Trainiere in einem Umfeld, das dich unterstützt, nicht bewertet.</p><h5>Probier’s aus – ganz ohne Druck. Wir freuen uns auf dich.</h5>",
 faq=[("Passe ich dazu?","Die Stunden sind für jede/n geeignet, der Sport treiben kann. Der Inhalt kann von allen erlernt werden."),
      ("Wie hart ist das Training?","Fordernd, aber in kleinen Schritten und absolut sicher – so profitierst du am meisten davon."),
      ("Wie melde ich mich an?","Melde dich einfach über das Formular an. Du kannst kostenlos kommen – wir rufen dich vorher kurz an.")],
 img="https://cdn.prod.website-files.com/651f0961164dd76d2ce8fd62/69d679ded3fb371a59abb73d_Class%20Thumbnail%20%20Resize%20%20(11).jpg")

RT_CSS = """<style>
.rt{padding:26px var(--mx) 0;max-width:660px;color:var(--grey);font-size:16px;line-height:1.6}
.rt p{margin:0 0 14px}
.rt h3,.rt h4{color:var(--white);font-size:clamp(20px,3vw,26px);margin:26px 0 12px}
.rt h5{color:var(--gold);font-size:16px;letter-spacing:.5px;margin:22px 0 8px;text-transform:uppercase}
.rt ul{margin:0 0 16px;padding-left:0;list-style:none}
.rt li{padding:8px 0 8px 26px;position:relative;border-bottom:1px solid var(--hair)}
.rt li:before{content:"";position:absolute;left:4px;top:14px;width:10px;height:16px;background:linear-gradient(105deg,transparent 44%,var(--gold) 44%,var(--gold) 58%,transparent 58%),linear-gradient(105deg,transparent 64%,var(--gold) 64%,var(--gold) 78%,transparent 78%)}
.rt strong{color:var(--white);font-weight:500}
.bigq{padding:90px var(--mx);max-width:1000px}
.bigq p{font-size:clamp(24px,4vw,44px);font-weight:300;line-height:1.25}
.bigq p b{color:var(--gold);font-weight:800}
.coursephoto{margin:60px 0 0}
.faqs{margin-top:44px;border-top:1px solid var(--hair)}
.faqs details{border-bottom:1px solid var(--hair)}
.faqs summary{padding:22px var(--mx);font-size:17px;font-weight:500;cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:16px}
.faqs summary:after{content:"+";color:var(--gold);font-weight:800;font-size:20px}
.faqs details[open] summary:after{content:"–"}
.faqs details p{padding:0 var(--mx) 22px;color:var(--grey);max-width:640px}
</style>"""

def wl(points):
    if not points: return ''
    tri='<svg class="tri" width="14" height="22" viewBox="33 12 36 76" overflow="visible" aria-hidden="true" style="flex:none"><path pathLength="100" d="M50.4 16.4 L37.4 50" style="stroke:var(--gold);stroke-width:3.4;fill:none"/><path pathLength="100" d="M56.7 16.4 L43.7 50" style="stroke:var(--gold);stroke-width:3.4;fill:none"/><path pathLength="100" d="M62.9 16.4 L37 83.5" style="stroke:var(--gold);stroke-width:3.4;fill:none"/><path pathLength="100" d="M56.2 50.1 L43.3 83.5" style="stroke:var(--gold);stroke-width:3.4;fill:none"/></svg>'
    rows=''.join('<div class="rev" style="font-size:clamp(17px,2.6vw,22px);font-weight:500;padding:14px var(--mx);border-bottom:1px solid var(--hair);display:flex;align-items:center;gap:14px">%s%s</div>'%(tri,p) for p in points)
    return '<div style="margin-top:26px;border-top:1px solid var(--hair)">%s</div>'%rows

NAMES = dict((s,(n,d)) for s,n,d in G.COURSES['de'])
t=G.T['de']
for slug,c in C.items():
    name,desc = NAMES[slug]
    trial = G.TRIAL_READY.get(('de','winterthur',slug), '/probetraining/')
    quote = '<section class="bigq"><p class="rev">%s</p></section>'%c['quote'] if c['quote'] else ''
    q2 = '<section class="bigq deep" style="max-width:none"><p class="rev" style="max-width:1000px">%s</p></section>'%c['why_rt2'] if c['why_rt2'] else ''
    faqs=''.join('<details><summary>%s</summary><p>%s</p></details>'%qa for qa in c['faq'])
    body = RT_CSS
    body += '<div class="photo rev coursephoto" style="aspect-ratio:1584/894;max-width:1100px;margin-left:auto;margin-right:auto"><img src="%s" alt="%s bei IMPACT Winterthur" loading="lazy" style="width:100%%;height:100%%;object-fit:cover" onerror="this.parentNode.remove()"></div>'%(c['img'],name)
    body += '<section class="chapter"><div class="chaphead">%s<div class="idx rev">01 — DIE DISZIPLIN</div><h2 class="rev">%s</h2></div><div class="rt rev">%s</div>%s</section>'%(G.bolt(),c['what_h'],rt(c['rt_what']),wl(c['learn']))
    body += quote
    body += '<section class="chapter deep" style="padding-bottom:90px"><div class="chaphead">%s<div class="idx rev">02 — WARUM IMPACT</div><h2 class="rev">Warum <span class="accent">IMPACT.</span></h2></div><div class="rt rev">%s</div>%s</section>'%(G.bolt(),rt(c['why_rt']),wl(c['why_pts']))
    body += q2
    body += '<section class="chapter"><div class="chaphead">%s<div class="idx rev">03 — %s</div><h2 class="rev">%s</h2></div><div class="rt rev">%s</div></section>'%(G.bolt(),c['special_h'].upper(),('Dein <span class="accent">Einstieg.</span>' if 'Einstieg' in c['special_h'] else 'Dein <span class="accent">Weg.</span>'),rt(c['special_rt']))
    body += '<section class="chapter deep" style="padding-bottom:80px"><div class="chaphead">%s<div class="idx rev">04 — FAQ</div><h2 class="rev">Keine <span class="accent">Ausreden.</span></h2></div><div class="faqs">%s</div></section>'%(G.bolt(),faqs)
    G.page('de','/winterthur/kurse/%s/'%slug,'%s Winterthur – IMPACT Martial Arts'%name.strip(),desc,
        'IMPACT Winterthur',name.strip().replace(' / ','<br>'),c['sub'],body,
        '/winterthur/kurse/%s/'%slug,'/en/winterthur/classes/%s/'%dict(zip([x[0] for x in G.COURSES['de']],[x[0] for x in G.COURSES['en']]))[slug],
        cta=(trial,t['trial']))
    print('enriched',slug)
print('done')
