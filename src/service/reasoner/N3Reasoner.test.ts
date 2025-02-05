import { N3ReasonerService } from "./N3Reasoner";

test('test_reasoning_engine', async () => {
    const rules = `
    @prefix : <http://example.org/rules#>.
    {?s ?p ?o} => {?s ?o ?p}.
    `;
    const data = `
    <http://example.org/subject> <http://example.org/predicate> <http://example.org/object>.
    `;

    const n3_reasoner = new N3ReasonerService(rules);
    const result = await n3_reasoner.reason(data);
    expect(result).toBe('<http://example.org/subject> <http://example.org/object> <http://example.org/predicate> .\n');
});

test('test_reasoning_engine_with_digits', async () => {
    const rules = `
    @prefix math: <http://www.w3.org/2000/10/swap/math#>.
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#>.
    @prefix ex: <http://example.org/#>.
    {?s <https://saref.etsi.org/core/hasValue> ?o . ?o math:notLessThan 6} => {?s ex:is ex:standing}.
    `;
    const data = `<https://rsp.js/aggregation_event/1> <https://saref.etsi.org/core/hasValue> "10"^^<http://www.w3.org/2001/XMLSchema#float> .`
    const n3_reasoner = new N3ReasonerService(rules);
    const result = await n3_reasoner.reason(data);
    console.log(result);
});

test('test_reasoning_engine_with_aggregation_event_for_activity_index', async () => {
    const data =
        `
        <https://rsp.js/aggregation_event/first> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <https://saref.etsi.org/core/Measurement> .
        <https://rsp.js/aggregation_event/first> <https://saref.etsi.org/core/hasTimestamp> "Date"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
        <https://rsp.js/aggregation_event/first> <https://saref.etsi.org/core/hasValue> "8"^^<http://www.w3.org/2001/XMLSchema#float> .
        <https://rsp.js/aggregation_event/first> <http://www.w3.org/ns/prov#wasDerivedFrom> <https://argahsuknesib.github.io/asdo/AggregatorService> .
        <https://rsp.js/aggregation_event/first> <http://w3id.org/rsp/vocals-sd#startedAt> "Date.First"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
        <https://rsp.js/aggregation_event/first> <http://w3id.org/rsp/vocals-sd#endedAt> "Date.Second"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
        `;

    const rules = `
    @prefix : <http://example.org/rules#>.
    @prefix math: <http://www.w3.org/2000/10/swap/math#>.
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#>.
    @prefix ex: <http://example.org/#>.
    {?s <https://saref.etsi.org/core/hasValue> ?o . ?o math:notLessThan 6} => {?s ex:is ex:standing}.
    {?s <https://saref.etsi.org/core/hasValue> ?o . ?o math:notLessThan 10} => {?s ex:is ex:sitting}. 
    {?s <https://saref.etsi.org/core/hasValue> ?o . ?o math:notLessThan 20} => {?s ex:is ex:walking}. 
    `
    const n3_reasoner = new N3ReasonerService(rules);
    const result = await n3_reasoner.reason(data);
    console.log(result);

});


