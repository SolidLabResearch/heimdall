import { hash_string_md5, quick_sort, insertion_sort, find_public_type_index, measureExecutionTimeSync, measureExecutionTimeAsync } from "./Util";

it('hash_string_md5', () => {
    const input = 'test';
    const output = '098f6bcd4621d373cade4e832627b4f6'
    console.log(hash_string_md5(input));
    expect(hash_string_md5(input)).toBe(output);
});

it('quick_sort_test', () => {
    const input_text = ['test', 'hello', 'world', 'a', 'b', 'c'];
    const output_text = ['a', 'b', 'c', 'hello', 'test', 'world'];
    expect(quick_sort(input_text)).toStrictEqual(output_text);
    const output_numbers: string[] = ['1', '2', '3', '4', '5'];
    const input_numbers: string[] = ['5', '4', '3', '2', '1'];
    expect(quick_sort(input_numbers)).toStrictEqual(output_numbers);
});


it('insertion_sort_test', () => {
    const input_text = ['test', 'hello', 'world', 'a', 'b', 'c'];
    const output_text = ['a', 'b', 'c', 'hello', 'test', 'world'];
    expect(insertion_sort(input_text)).toStrictEqual(output_text);
    const output_numbers: string[] = ['1', '2', '3', '4', '5'];
    const input_numbers: string[] = ['5', '4', '3', '2', '1'];
    expect(insertion_sort(input_numbers)).toStrictEqual(output_numbers);
});

describe('finding_public_type_index', () => {
    it('exports the public type index helper', () => {
        expect(typeof find_public_type_index).toBe('function');
    });

    it('should_handle_error_during_fetch', async () => {
        const pod_url = 'http://n061-14a.wall2.ilabt.iminds.be:3000/';
        const result = await find_public_type_index(pod_url);
        expect(result).toBe('');
    });

    it('uses configured source access for protected profile discovery', async () => {
        const sourceFetch = jest.fn().mockResolvedValue({
            ok: true,
            text: jest.fn().mockResolvedValue('<https://pod.example/profile/card#me> <http://www.w3.org/ns/solid/terms#publicTypeIndex> <https://pod.example/settings/publicTypeIndex> .'),
        });
        const access = { fetchFor: jest.fn().mockResolvedValue(sourceFetch) };
        await expect(find_public_type_index('https://pod.example/', undefined, access as any)).resolves.toBe('https://pod.example/settings/publicTypeIndex');
        expect(access.fetchFor).toHaveBeenCalledWith('https://pod.example/profile/card', 'https://pod.example/');
        expect(sourceFetch).toHaveBeenCalledWith('https://pod.example/profile/card', { headers: { Accept: 'text/turtle' } });
    });
});


describe('measureExecutionTimeSync', () => {
    it('should_measure_execution_time_sync', () => {
        const mock_function = jest.fn(() => {
            for (let i = 0; i < 100000000; i++) {
                // do nothing
            }
        });
        const result = measureExecutionTimeSync(mock_function, 'test');
        expect(mock_function).toHaveBeenCalled();
        expect(result.execution_time).toBeGreaterThanOrEqual(0);
        expect(result.component_name).toBe('test');
    });
})

describe('measureExecutionTimeAsync', () => {
    it('should_measure_execution_time_async', async () => {
        const mock_async_function = jest.fn(async () => Promise.resolve());
        const result = await measureExecutionTimeAsync(mock_async_function, 'test');
        expect(mock_async_function).toHaveBeenCalled();
        expect(result.execution_time).toBeGreaterThanOrEqual(0);
        expect(result.component_name).toBe('test');
    });
});
