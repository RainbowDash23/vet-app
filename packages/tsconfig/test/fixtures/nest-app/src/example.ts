function ClassDecorator(): ClassDecorator {
  return () => {};
}

function MethodDecorator(): MethodDecorator {
  return () => {};
}

@ClassDecorator()
export class SampleNestService {
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  @MethodDecorator()
  public greet(): string {
    return `Hello, ${this.name}`;
  }
}
